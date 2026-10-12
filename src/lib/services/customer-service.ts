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

  async recordCredit(entry: Omit<CreditEntry, 'updatedAt' | 'isDeleted'>): Promise<void> {
    const now = Date.now();
    const newEntry = {
      ...entry,
      updatedAt: now,
      isDeleted: false,
    } as CreditEntry;
    
    await syncDb.add(STORES.CREDIT_LOG, newEntry);
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
    const customer = await this.getById(target.customerId);
    if (customer) {
      const activeEntries = (await this.getCreditHistory(customer.id)).filter(e => e.id !== entryId && !e.isDeleted);
      const newTotal = activeEntries.reduce((sum, e) => sum + e.amount, 0);
      const updatedCustomer: Customer = {
        ...customer,
        totalUtang: Math.max(0, newTotal),
        updatedAt: Date.now(),
      };
      await this.update(updatedCustomer);
    }
  }

  async clearCustomerBalance(customerId: string, note: string = 'Balance Cleared / Deleted'): Promise<void> {
    const customer = await this.getById(customerId);
    if (!customer || customer.totalUtang <= 0) return;

    const currentBalance = customer.totalUtang;
    const now = Date.now();

    // Record an offsetting settlement entry in CREDIT_LOG so history reflects the balance clearance
    const clearanceEntry: CreditEntry = {
      id: crypto.randomUUID(),
      customerId,
      branchId: customer.branchId,
      amount: -currentBalance,
      type: 'payment',
      description: note,
      timestamp: now,
      updatedAt: now,
      isDeleted: false,
    };
    await syncDb.add(STORES.CREDIT_LOG, clearanceEntry);

    // Zero out customer balance
    const updatedCustomer: Customer = {
      ...customer,
      totalUtang: 0,
      updatedAt: now,
    };
    await this.update(updatedCustomer);
  }
}

export const customerService = new CustomerService();
