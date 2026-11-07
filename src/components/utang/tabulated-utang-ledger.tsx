'use client';

import React, { useState, useMemo } from 'react';
import { Customer, CreditEntry } from '@/lib/db/idb';
import { 
  Table as TableIcon, 
  Search, 
  Download, 
  Printer, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft, 
  User, 
  Phone, 
  History, 
  Scale, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  CloudUpload, 
  CloudDownload,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';

interface TabulatedUtangLedgerProps {
  customers: Customer[];
  onSelectCustomer: (customer: Customer) => void;
  onRefresh: () => Promise<void> | void;
  onDeleteEntry?: (entryId: string, customerId: string, amount: number) => Promise<void> | void;
  onAdjustBalance: (customer: Customer) => void;
}

export function TabulatedUtangLedger({
  customers,
  onSelectCustomer,
  onRefresh,
  onAdjustBalance
}: TabulatedUtangLedgerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'settled'>('all');
  const [isSyncingRedis, setIsSyncingRedis] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Compute tabulated summary KPIs
  const kpis = useMemo(() => {
    let totalUtang = 0;
    let customerCountWithDebt = 0;
    let totalCustomers = customers.length;
    let settledCustomers = 0;

    customers.forEach(c => {
      const balance = Number(c.totalUtang) || 0;
      if (balance > 0) {
        totalUtang += balance;
        customerCountWithDebt++;
      } else {
        settledCustomers++;
      }
    });

    return {
      totalUtang,
      customerCountWithDebt,
      totalCustomers,
      settledCustomers
    };
  }, [customers]);

  // Filtered customer ledger list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.contact && c.contact.includes(searchQuery)) ||
        (c.notes && c.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const balance = Number(c.totalUtang) || 0;
      if (statusFilter === 'unpaid') return matchesSearch && balance > 0;
      if (statusFilter === 'settled') return matchesSearch && balance <= 0;
      return matchesSearch;
    });
  }, [customers, searchQuery, statusFilter]);

  // Push all tabulated Utang data to Upstash Redis Webhook helper
  const handlePushToRedis = async () => {
    setIsSyncingRedis(true);
    setSyncStatus(null);
    try {
      const payload = {
        action: 'push_ledger',
        timestamp: Date.now(),
        customers: customers.map(c => ({
          id: c.id,
          name: c.name,
          contact: c.contact || '',
          totalUtang: Number(c.totalUtang) || 0,
          updatedAt: c.updatedAt || Date.now(),
          notes: c.notes || ''
        }))
      };

      const res = await fetch('/api/utang-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSyncStatus({
          success: true,
          message: `Tabulated ledger pushed to Upstash Redis (${customers.length} records documented).`
        });
      } else {
        setSyncStatus({
          success: false,
          message: data?.error || 'Webhook returned error pushing to Upstash Redis.'
        });
      }
    } catch (err: any) {
      setSyncStatus({
        success: false,
        message: err?.message || 'Failed to connect to /api/utang-webhook.'
      });
    } finally {
      setIsSyncingRedis(false);
      setTimeout(() => setSyncStatus(null), 5000);
    }
  };

  // Pull latest records from Upstash Redis via Webhook helper
  const handlePullFromRedis = async () => {
    setIsSyncingRedis(true);
    setSyncStatus(null);
    try {
      const res = await fetch('/api/utang-webhook?action=pull_ledger');
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        await onRefresh();
        setSyncStatus({
          success: true,
          message: `Pulled from Upstash Redis successfully. Ledger synchronized.`
        });
      } else {
        setSyncStatus({
          success: false,
          message: data?.error || 'Failed to pull from Upstash Redis.'
        });
      }
    } catch (err: any) {
      setSyncStatus({
        success: false,
        message: err?.message || 'Network error pulling from Upstash Redis.'
      });
    } finally {
      setIsSyncingRedis(false);
      setTimeout(() => setSyncStatus(null), 5000);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Customer Name', 'Contact Number', 'Outstanding Balance (₱)', 'Status', 'Notes'];
    const rows = filteredCustomers.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.contact || '').replace(/"/g, '""')}"`,
      Number(c.totalUtang || 0).toFixed(2),
      Number(c.totalUtang || 0) > 0 ? 'MAY UTANG' : 'CLEARED / FULLY PAID',
      `"${(c.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Tabulated-Utang-Ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Tabulated Ledger
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards (2x2 on mobile, 4 across on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 block mb-1">
            Total Receivables
          </span>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-rose-600 dark:text-rose-400">
            ₱{kpis.totalUtang.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] font-bold text-gray-500 mt-1 block">Active total debt balance</span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 block mb-1">
            Customers With Debt
          </span>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-600 dark:text-amber-400">
            {kpis.customerCountWithDebt}
          </div>
          <span className="text-[10px] font-bold text-gray-500 mt-1 block">Accounts with balance &gt; 0</span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 block mb-1">
            Settled Accounts
          </span>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {kpis.settledCustomers}
          </div>
          <span className="text-[10px] font-bold text-gray-500 mt-1 block">Fully paid / ₱0 balance</span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-400 block mb-1">
            Total Accounts
          </span>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 dark:text-blue-400">
            {kpis.totalCustomers}
          </div>
          <span className="text-[10px] font-bold text-gray-500 mt-1 block">Registered in credit database</span>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${
          syncStatus.success 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
        }`}>
          {syncStatus.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <div className="text-xs font-bold">{syncStatus.message}</div>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tabulated customer..."
            className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
            }`}
          >
            All ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('unpaid')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === 'unpaid'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
            }`}
          >
            May Utang ({kpis.customerCountWithDebt})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('settled')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === 'settled'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
            }`}
          >
            Fully Paid ({kpis.settledCustomers})
          </button>
        </div>

        {/* Actions (Redis Push/Pull, Export CSV, Print) */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={handlePushToRedis}
            disabled={isSyncingRedis}
            title="Push documented ledger to Upstash Redis via Webhook"
            className="px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>Push Webhook</span>
          </button>

          <button
            type="button"
            onClick={handlePullFromRedis}
            disabled={isSyncingRedis}
            title="Pull synchronized ledger from Upstash Redis"
            className="px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>Pull DB</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-gray-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Tabulated Ledger Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="py-4 px-4 sm:px-6">Customer</th>
                <th className="py-4 px-4">Contact</th>
                <th className="py-4 px-4 text-right">Outstanding Balance</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4">Notes / History</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs font-medium">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400 font-bold">
                    No matching customer credit accounts found.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const balance = Number(customer.totalUtang) || 0;
                  const hasDebt = balance > 0;

                  return (
                    <tr 
                      key={customer.id} 
                      className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* Customer Name */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black text-sm shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-black text-gray-950 dark:text-white text-sm">
                              {customer.name}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              ID: {customer.id.substring(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-4 px-4">
                        {customer.contact ? (
                          <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {customer.contact}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">No Contact</span>
                        )}
                      </td>

                      {/* Outstanding Balance */}
                      <td className="py-4 px-4 text-right">
                        <span className={`text-base font-black ${
                          hasDebt 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          ₱{balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          hasDebt
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {hasDebt ? 'MAY UTANG' : 'CLEARED'}
                        </span>
                      </td>

                      {/* Notes / Last Updated */}
                      <td className="py-4 px-4 max-w-xs truncate">
                        <div className="text-gray-600 dark:text-gray-300 font-bold truncate">
                          {customer.notes || 'Strict documented balance ledger'}
                        </div>
                        {customer.updatedAt && (
                          <div className="text-[10px] text-gray-400">
                            Updated: {format(customer.updatedAt, 'MMM dd, yyyy')}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectCustomer(customer)}
                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-orange-600 hover:text-white dark:hover:bg-orange-600 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                            title="View Full Statement of Account"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Statement</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onAdjustBalance(customer)}
                            className="p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl transition-all cursor-pointer"
                            title="Align or Adjust Balance"
                          >
                            <Scale className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
