'use client';

import { BaseService } from './base-service';
import { Customer, CreditEntry, STORES, dbUtil } from '@/lib/db/idb';
import { syncDb } from '@/lib/db/sync-queue';

class CustomerService extends BaseService<Customer> {
  constructor() {
    super(STORES.CUSTOMERS);
  }

  async getByBranch(branchId: string): Promise<Customer[]> {
    return this.query(c => c.branchId === branchId);
  }

  async getCreditHistory(customerId: string): Promise<CreditEntry[]> {
    const all = await dbUtil.getItems<CreditEntry>(STORES.CREDIT_LOG);
    return all.filter(e => e.customerId === customerId && !e.isDeleted);
  }

  async getAllCreditEntries(branchId?: string): Promise<CreditEntry[]> {
    const all = await dbUtil.getItems<CreditEntry>(STORES.CREDIT_LOG);
    return all.filter(e => (!branchId || e.branchId === branchId) && !e.isDeleted);
  }

  async recalculateCustomerBalance(customerId: string): Promise<number> {
    const customer = await this.getById(customerId);
    if (!customer) return 0;

    const history = await this.getCreditHistory(customerId);
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

      const customerMap = new Map<string, CreditEntry[]>();
      for (const entry of allCredits) {
        if (entry.isDeleted) continue;
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
}

export const customerService = new CustomerService();

