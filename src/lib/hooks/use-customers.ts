'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Customer, CreditEntry, STORES } from '@/lib/db/idb';
import { customerService } from '@/lib/services/customer-service';
import { realtimeSync } from '@/lib/db/realtime-sync';

export function useCustomers(branchId?: string) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const isInitialMount = useRef(true);

  const fetchCustomers = useCallback(async (silent = false) => {
    // Only show full-screen loader on initial mount if we don't have cached data yet
    if (!silent && isInitialMount.current) {
      setLoading(true);
    }
    try {
      let data: Customer[];
      if (branchId) {
        data = await customerService.getByBranch(branchId);
      } else {
        data = await customerService.getAll();
      }
      setCustomers(data.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      if (isInitialMount.current) {
        setLoading(false);
        isInitialMount.current = false;
      }
    }
  }, [branchId]);

  useEffect(() => {
    // Initial load
    fetchCustomers(false);

    // Initial balance alignment in background (silent, no loading flash)
    customerService.recalculateAllCustomerBalances().then(() => {
      fetchCustomers(true);
    }).catch(() => {});

    // Passively auto sync with Upstash Redis in the background
    customerService.passiveSyncWithRedis().then((res) => {
      if (res && res.pulled > 0) {
        fetchCustomers(true);
      }
    }).catch(() => {});

    // Debounced realtime auto refresh on credit log or customer updates
    let debounceTimer: any = null;
    const unsubscribe = realtimeSync.subscribe([STORES.CUSTOMERS, STORES.CREDIT_LOG], () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchCustomers(true);
      }, 300);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [fetchCustomers]);

  const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalUtang' | 'branchId' | 'isDeleted'>): Promise<Customer> => {
    const effectiveBranchId = branchId || 'main_branch';
    const id = crypto.randomUUID();
    const now = Date.now();
    const newCustomer: Customer = {
      ...customer,
      id,
      totalUtang: 0,
      branchId: effectiveBranchId,
      createdAt: now,
      updatedAt: now,
    };
    await customerService.create(newCustomer);
    await fetchCustomers(true);
    return newCustomer;
  };

  const updateCustomer = async (customer: Customer) => {
    await customerService.update(customer);
    await fetchCustomers(true);
  };

  const deleteCustomer = async (id: string) => {
    await customerService.delete(id);
    await fetchCustomers(true);
  };

  const recordCredit = async (
    customerId: string, 
    amount: number | string, 
    description: string, 
    type: 'credit' | 'payment',
    targetCreditId?: string,
    customTimestamp?: number
  ) => {
    // 1. Sanitize and parse amount (strips commas, currency symbols, spaces)
    let parsedAmount = 0;
    if (typeof amount === 'number') {
      parsedAmount = isNaN(amount) ? 0 : Math.abs(amount);
    } else if (typeof amount === 'string') {
      const cleaned = amount.replace(/[^0-9.]/g, '');
      parsedAmount = parseFloat(cleaned) || 0;
    }

    if (parsedAmount <= 0) {
      throw new Error('Please enter a valid amount greater than 0.');
    }

    const customer = customers.find(c => c.id === customerId) || (await customerService.getById(customerId));
    if (!customer) {
      throw new Error('Customer not found');
    }

    const effectiveBranchId = branchId || customer.branchId || 'main_branch';
    const now = Date.now();
    const entryTimestamp = customTimestamp && !isNaN(customTimestamp) ? customTimestamp : now;

    const entry: Omit<CreditEntry, 'updatedAt' | 'isDeleted'> = {
      id: crypto.randomUUID(),
      customerId,
      branchId: effectiveBranchId,
      amount: type === 'credit' ? parsedAmount : -parsedAmount,
      type,
      description: description.trim() || (type === 'credit' ? 'Store Credit' : 'Payment Received'),
      timestamp: entryTimestamp,
      ...(targetCreditId ? { targetCreditId } : {}),
    };

    // recordCredit atomically stores the entry and recalculates customer's totalUtang from the ledger
    await customerService.recordCredit(entry);
    await fetchCustomers(true);
  };

  const getCreditHistory = async (customerId: string) => {
    const history = await customerService.getCreditHistory(customerId);
    return history.sort((a, b) => b.timestamp - a.timestamp);
  };

  const deleteCreditEntry = async (entryId: string) => {
    await customerService.deleteCreditEntry(entryId);
    await fetchCustomers(true);
  };

  const clearCustomerBalance = async (customerId: string, note?: string) => {
    await customerService.clearCustomerBalance(customerId, note);
    await fetchCustomers(true);
  };

  const adjustCustomerBalance = async (customerId: string, targetBalance: number, note?: string) => {
    await customerService.adjustCustomerBalance(customerId, targetBalance, note);
    await fetchCustomers(true);
  };

  const getAllCreditLogs = async () => {
    const history = await customerService.getAllCreditEntries(branchId);
    return history.sort((a, b) => b.timestamp - a.timestamp);
  };

  return {
    customers,
    loading,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    recordCredit,
    getCreditHistory,
    deleteCreditEntry,
    clearCustomerBalance,
    adjustCustomerBalance,
    getAllCreditLogs,
    refresh: async () => {
      await customerService.recalculateAllCustomerBalances();
      await fetchCustomers(true);
    },
  };
}
