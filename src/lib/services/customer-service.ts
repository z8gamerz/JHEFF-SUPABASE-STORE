'use client';

import { BaseService } from './base-service';
import { Customer, CreditEntry, STORES, dbUtil } from '@/lib/db/idb';
import { syncDb } from '@/lib/db/sync-queue';
import { upstashRedis } from './redis-service';

class CustomerService extends BaseService<Customer> {
  constructor() {
    super(STORES.CUSTOMERS);
  }

  async getByBranch(branchId: string): Promise<Customer[]> {
    return this.query(c => c.branchId === branchId);
  }

  async getCreditHistory(customerId: string): Promise<CreditEntry[]> {
    const all = await dbUtil.getItems<CreditEntry>(STORES.CREDIT_LOG);
    return all.filter(e => e.customerId === customerId && !e.isDeleted && e.id !== 'ee855993-866b-41b0-b141-aa72fdb671c3');
  }

  async getAllCreditEntries(branchId?: string): Promise<CreditEntry[]> {
    const all = await dbUtil.getItems<CreditEntry>(STORES.CREDIT_LOG);
    return all.filter(e => (!branchId || e.branchId === branchId) && !e.isDeleted && e.id !== 'ee855993-866b-41b0-b141-aa72fdb671c3');
  }

  async recalculateCustomerBalance(customerId: string): Promise<number> {
    const customer = await this.getById(customerId);
    if (!customer) return 0;

    let history = await this.getCreditHistory(customerId);
    
    // Auto-prune specific legacy duplicate/stale entry for AI AI if present
    const staleEntry = history.find(e => e.id === 'ee855993-866b-41b0-b141-aa72fdb671c3' && !e.isDeleted);
    if (staleEntry) {
      staleEntry.isDeleted = true;
      staleEntry.updatedAt = Date.now();
      await syncDb.update(STORES.CREDIT_LOG, staleEntry);
      history = history.filter(e => e.id !== 'ee855993-866b-41b0-b141-aa72fdb671c3');
    }

    let total = 0;
    for (const entry of history) {
      if (entry.isDeleted) continue;
      const amt = Math.abs(Number(entry.amount) || 0);
      if (entry.type === 'credit') {
        total += amt;
      } else if (entry.type === 'payment') {
        total -= amt;
      }
    }
    const finalBalance = Math.max(0, Math.round(total * 100) / 100);
    const currentUtang = Number(customer.totalUtang);

    if (isNaN(currentUtang) || Math.abs(currentUtang - finalBalance) > 0.001) {
      const updatedCustomer: Customer = {
        ...customer,
        totalUtang: finalBalance,
        updatedAt: Date.now(),
      };
      await this.update(updatedCustomer);
    }
    return finalBalance;
  }

  async recalculateAllCustomerBalances(): Promise<void> {
    try {
      const customers = await this.getAll();
      const allCredits = await dbUtil.getItems<CreditEntry>(STORES.CREDIT_LOG);

      // Auto-prune specific legacy duplicate/stale entry for AI AI if present
      const staleAiAiEntry = allCredits.find(e => e.id === 'ee855993-866b-41b0-b141-aa72fdb671c3' && !e.isDeleted);
      if (staleAiAiEntry) {
        staleAiAiEntry.isDeleted = true;
        staleAiAiEntry.updatedAt = Date.now();
        await syncDb.update(STORES.CREDIT_LOG, staleAiAiEntry);
      }

      const customerMap = new Map<string, CreditEntry[]>();
      for (const entry of allCredits) {
        if (entry.isDeleted || entry.id === 'ee855993-866b-41b0-b141-aa72fdb671c3') continue;
        const list = customerMap.get(entry.customerId) || [];
        list.push(entry);
        customerMap.set(entry.customerId, list);
      }

      for (const customer of customers) {
        if (customer.isDeleted) continue;
        const entries = customerMap.get(customer.id) || [];
        let total = 0;
        for (const entry of entries) {
          const amt = Math.abs(Number(entry.amount) || 0);
          if (entry.type === 'credit') {
            total += amt;
          } else if (entry.type === 'payment') {
            total -= amt;
          }
        }
        const finalBalance = Math.max(0, Math.round(total * 100) / 100);
        const currentUtang = Number(customer.totalUtang);

        if (isNaN(currentUtang) || Math.abs(currentUtang - finalBalance) > 0.001) {
          await this.update({
            ...customer,
            totalUtang: finalBalance,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      console.warn('Failed to auto-reconcile customer balances:', err);
    }
  }

  async recordCredit(entry: Omit<CreditEntry, 'updatedAt' | 'isDeleted'>): Promise<number> {
    const now = Date.now();
    const rawAmt = typeof entry.amount === 'number' 
      ? entry.amount 
      : parseFloat(String(entry.amount).replace(/[^0-9.]/g, ''));
    const safeAmt = isNaN(rawAmt) ? 0 : Math.abs(rawAmt);

    // Enforce proper sign: positive for credit, negative for payment
    const normalizedAmount = entry.type === 'credit' ? safeAmt : -safeAmt;

    const newEntry: CreditEntry = {
      ...entry,
      amount: normalizedAmount,
      updatedAt: now,
      isDeleted: false,
    };
    
    await syncDb.add(STORES.CREDIT_LOG, newEntry);

    // Auto-push directly to Upstash Redis DB via Webhook helper in background
    this.getById(entry.customerId).then((cust) => {
      upstashRedis.pushUtangRecord(newEntry, cust || undefined).catch((e) => {
        console.warn('[CustomerService] Upstash Redis background push skipped:', e);
      });
    }).catch(() => {});

    // Automatically recalculate and synchronize customer's totalUtang with the exact ledger entries
    return await this.recalculateCustomerBalance(entry.customerId);
  }

  async deleteCreditEntry(entryId: string): Promise<void> {
    const all = await dbUtil.getItems<CreditEntry>(STORES.CREDIT_LOG);
    const target = all.find(e => e.id === entryId);
    if (!target) return;

    const updatedEntry: CreditEntry = {
      ...target,
      isDeleted: true,
      updatedAt: Date.now(),
    };
    await syncDb.update(STORES.CREDIT_LOG, updatedEntry);

    // Recalculate customer totalUtang
    await this.recalculateCustomerBalance(target.customerId);
  }

  async clearCustomerBalance(customerId: string, note: string = 'Balance Cleared / Deleted'): Promise<void> {
    const customer = await this.getById(customerId);
    if (!customer) return;

    // Recalculate true current balance first
    const currentBalance = await this.recalculateCustomerBalance(customerId);
    if (currentBalance <= 0.0001) return;

    const now = Date.now();

    // Record an offsetting settlement entry in CREDIT_LOG so history reflects the balance clearance
    const clearanceEntry: CreditEntry = {
      id: crypto.randomUUID(),
      customerId,
      branchId: customer.branchId || 'main_branch',
      amount: -currentBalance,
      type: 'payment',
      description: note,
      timestamp: now,
      updatedAt: now,
      isDeleted: false,
    };
    await syncDb.add(STORES.CREDIT_LOG, clearanceEntry);

    // Reconcile to zero
    await this.recalculateCustomerBalance(customerId);
  }

  async adjustCustomerBalance(
    customerId: string, 
    targetBalance: number, 
    note: string = 'Balance Adjustment'
  ): Promise<number> {
    const customer = await this.getById(customerId);
    if (!customer) return 0;

    const currentBalance = await this.recalculateCustomerBalance(customerId);
    const safeTarget = Math.max(0, Math.round(Number(targetBalance) * 100) / 100);
    const diff = safeTarget - currentBalance;

    if (Math.abs(diff) < 0.001) {
      return currentBalance;
    }

    const now = Date.now();
    const isIncrease = diff > 0;
    const entry: CreditEntry = {
      id: crypto.randomUUID(),
      customerId,
      branchId: customer.branchId || 'main_branch',
      amount: isIncrease ? Math.abs(diff) : -Math.abs(diff),
      type: isIncrease ? 'credit' : 'payment',
      description: note || (isIncrease ? 'Balance Adjustment (Added Utang)' : 'Balance Settlement (Prior Period Cleared)'),
      timestamp: now,
      updatedAt: now,
      isDeleted: false,
    };

    await syncDb.add(STORES.CREDIT_LOG, entry);
    upstashRedis.pushUtangRecord(entry, customer).catch(() => {});
    return await this.recalculateCustomerBalance(customerId);
  }
}

export const customerService = new CustomerService();

