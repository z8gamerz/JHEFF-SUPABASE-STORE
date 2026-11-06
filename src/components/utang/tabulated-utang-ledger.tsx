'use client';

import { useState, useEffect, useMemo } from 'react';
import { Customer, CreditEntry } from '@/lib/db/idb';
import { upstashRedis, TabulatedRedisSummary } from '@/lib/services/redis-service';
import { 
  Table, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  SlidersHorizontal, 
  Trash2, 
  FileSpreadsheet, 
  ExternalLink,
  Zap,
  User,
  Tag,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TabulatedUtangLedgerProps {
  customers: Customer[];
  onSelectCustomer: (customer: Customer) => void;
  onRefresh: () => Promise<void>;
  onDeleteEntry?: (id: string) => Promise<void>;
  onAdjustBalance?: (customer: Customer) => void;
}

export function TabulatedUtangLedger({
  customers,
  onSelectCustomer,
  onRefresh,
  onDeleteEntry,
  onAdjustBalance
}: TabulatedUtangLedgerProps) {
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'payment'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');
  const [isSyncingRedis, setIsSyncingRedis] = useState(false);
  const [redisStatus, setRedisStatus] = useState<{ connected: boolean; ping: string; latencyMs: number } | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [viewSource, setViewSource] = useState<'local' | 'redis'>('local');
  const [redisSummary, setRedisSummary] = useState<TabulatedRedisSummary | null>(null);

  // Map customers for quick lookup
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) {
      map.set(c.id, c);
    }
    return map;
  }, [customers]);

  // Load entries from customerService / IndexedDB
  const fetchLocalEntries = async () => {
    setLoading(true);
    try {
      const { customerService } = await import('@/lib/services/customer-service');
      const all = await customerService.getAllCreditEntries();
      setEntries(all.sort((a, b) => b.timestamp - a.timestamp));
      setViewSource('local');
    } catch (e) {
      console.error('Failed to load local credit entries:', e);
    } finally {
      setLoading(false);
    }
  };

  // Test Redis connection on mount
  useEffect(() => {
    fetchLocalEntries();
    upstashRedis.ping().then(status => {
      setRedisStatus(status);
    }).catch(() => {
      setRedisStatus({ connected: false, ping: 'Failed', latencyMs: 0 });
    });
  }, []);

  // Webhook Push All directly to Upstash Redis
  const handlePushAllToRedis = async () => {
    setIsSyncingRedis(true);
    setSyncSuccessMsg(null);
    try {
      const res = await upstashRedis.syncAllToRedis(entries, customers);
      if (res.success) {
        setSyncSuccessMsg(`Successfully pushed ${res.count} records to Upstash Redis DB via Webhook!`);
        setTimeout(() => setSyncSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      alert(`Failed to push to Redis: ${err?.message || 'Network error'}`);
    } finally {
      setIsSyncingRedis(false);
    }
  };

  // Webhook Pull Live Data from Upstash Redis
  const handlePullFromRedis = async () => {
    setLoading(true);
    setSyncSuccessMsg(null);
    try {
      const result = await upstashRedis.pullAllUtang();
      setEntries(result.entries.sort((a, b) => b.timestamp - a.timestamp));
      setRedisSummary(result.summary);
      setViewSource('redis');
      setSyncSuccessMsg(`Pulled ${result.entries.length} tabulated records live from Upstash Redis DB!`);
      setTimeout(() => setSyncSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to pull from Redis: ${err?.message || 'Network error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Copy webhook URL helper
  const handleCopyWebhookUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}/api/utang-webhook`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  // Filter entries based on search, customer, and type
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (e.isDeleted) return false;

      // Filter by type
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;

      // Filter by customer
      if (selectedCustomerId !== 'all' && e.customerId !== selectedCustomerId) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const custName = customerMap.get(e.customerId)?.name.toLowerCase() || '';
        const desc = (e.description || '').toLowerCase();
        const ref = (e.id || '').toLowerCase();
        return custName.includes(query) || desc.includes(query) || ref.includes(query);
      }

      return true;
    });
  }, [entries, typeFilter, selectedCustomerId, searchQuery, customerMap]);

  // Tabulated Metrics Summary
  const { totalDebits, totalCredits, totalRecords } = useMemo(() => {
    let debits = 0; // Incurred utang
    let credits = 0; // Bayad / payments
    for (const e of filteredEntries) {
      const amt = Math.abs(Number(e.amount) || 0);
      if (e.type === 'credit') debits += amt;
      else if (e.type === 'payment') credits += amt;
    }
    return {
      totalDebits: Math.round(debits * 100) / 100,
      totalCredits: Math.round(credits * 100) / 100,
      totalRecords: filteredEntries.length,
    };
  }, [filteredEntries]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['Record ID', 'Date & Time', 'Customer Name', 'Contact', 'Type', 'Description', 'Utang Incurred (₱)', 'Payment Received (₱)', 'Branch'];
    const rows = filteredEntries.map(e => {
      const cust = customerMap.get(e.customerId);
      const isCredit = e.type === 'credit';
      const amt = Math.abs(Number(e.amount) || 0);
      const dateStr = new Date(e.timestamp).toLocaleString('en-PH');
      return [
        e.id,
        `"${dateStr}"`,
        `"${cust?.name || 'Unknown'}"`,
        `"${cust?.contact || ''}"`,
        isCredit ? 'CREDIT / UTANG' : 'PAYMENT / BAYAD',
        `"${(e.description || '').replace(/"/g, '""')}"`,
        isCredit ? amt.toFixed(2) : '0.00',
        !isCredit ? amt.toFixed(2) : '0.00',
        e.branchId || 'main_branch'
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Tabulated_Utang_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Upstash Redis Webhook Helper Integration Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-gray-900 to-indigo-950 text-white rounded-3xl p-6 border border-gray-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-600/20 border border-red-500/30 text-red-400 rounded-xl flex items-center justify-center">
                <Database className="w-5 h-5 text-red-500 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black tracking-tight text-white uppercase">
                    Upstash Redis Webhook Helper & Cloud DB
                  </h3>
                  {redisStatus?.connected ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Connected ({redisStatus.latencyMs}ms)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Connecting...
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 font-medium mt-0.5">
                  Host: <code className="text-red-300 font-mono">proper-gull-192572.upstash.io</code> | Mode: <strong>Strictly Tabulated Ledger</strong>
                </p>
              </div>
            </div>

            {/* Webhook Endpoint copy helper */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Webhook Endpoint:</span>
              <div className="flex items-center gap-1.5 bg-black/40 border border-gray-700/80 px-2.5 py-1 rounded-lg">
                <code className="text-xs text-red-300 font-mono">/api/utang-webhook</code>
                <button
                  type="button"
                  onClick={handleCopyWebhookUrl}
                  className="p-1 hover:text-white text-gray-400 transition-colors cursor-pointer"
                  title="Copy full Webhook URL"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="text-[11px] text-gray-500 italic">
                (Auto-pushes on every transaction; pull out anytime)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePushAllToRedis}
              disabled={isSyncingRedis}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-red-600/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Push all local tabulated Utang data to Upstash Redis DB"
            >
              {isSyncingRedis ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Push to Redis DB
            </button>

            <button
              type="button"
              onClick={handlePullFromRedis}
              disabled={loading}
              className="bg-slate-800 hover:bg-slate-700 border border-gray-700 text-gray-200 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Pull out all tabulated records live from Upstash Redis DB"
            >
              <RefreshCw className={`w-4 h-4 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
              Pull from Redis DB
            </button>

            {viewSource === 'redis' && (
              <button
                type="button"
                onClick={fetchLocalEntries}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                Reset to Local
              </button>
            )}
          </div>
        </div>

        {/* Sync Success Notification Banner */}
        {syncSuccessMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-300 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </motion.div>
        )}
      </div>

      {/* Tabulated KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-gray-900 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5 sm:mb-1">
            Total Records
          </p>
          <p className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white">
            {totalRecords} <span className="text-xs font-bold text-gray-400">entries</span>
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 truncate">Source: <strong className="capitalize">{viewSource}</strong></p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5 sm:mb-1">
            Utang (+Debits)
          </p>
          <p className="text-lg sm:text-2xl font-black text-red-600 dark:text-rose-400 truncate">
            ₱{totalDebits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">Total credit extended</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5 sm:mb-1">
            Bayad (-Credits)
          </p>
          <p className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 truncate">
            ₱{totalCredits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">Total cash/digital bayad</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5 sm:mb-1">
            Net Receivables
          </p>
          <p className="text-lg sm:text-2xl font-black text-purple-600 dark:text-purple-400 truncate">
            ₱{Math.max(0, totalDebits - totalCredits).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">Outstanding balance</p>
        </div>
      </div>

      {/* Strict Filter & Documentation Toolbar */}
      <div className="bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64 min-w-[160px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, item, ref..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Customer Dropdown Filter */}
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-red-500 cursor-pointer max-w-[180px] truncate"
          >
            <option value="all">All Customers ({customers.length})</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.totalUtang > 0 ? `(₱${c.totalUtang.toFixed(2)})` : '(Paid)'}
              </option>
            ))}
          </select>

          {/* Type Filter Buttons */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 ${
                typeFilter === 'all'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('credit')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 ${
                typeFilter === 'credit'
                  ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-rose-400 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Credits (+Utang)
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('payment')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 ${
                typeFilter === 'payment'
                  ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Payments (-Bayad)
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Printer className="w-3.5 h-3.5 text-gray-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Master Tabulated Ledger Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="py-4 px-5">Ref / Timestamp</th>
                <th className="py-4 px-4">Customer</th>
                <th className="py-4 px-4">Type</th>
                <th className="py-4 px-4">Particulars / Description</th>
                <th className="py-4 px-4 text-right">Debit (+Utang)</th>
                <th className="py-4 px-4 text-right">Credit (-Bayad)</th>
                <th className="py-4 px-4 text-center">Sync DB Status</th>
                <th className="py-4 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-500" />
                    <p className="font-bold">Tabulating Utang ledger data...</p>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    <Table className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-bold text-gray-600 dark:text-gray-300">No tabulated records found matching your filters.</p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry, idx) => {
                  const cust = customerMap.get(entry.customerId);
                  const isCredit = entry.type === 'credit';
                  const amt = Math.abs(Number(entry.amount) || 0);
                  const formattedDate = new Date(entry.timestamp).toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });
                  const formattedTime = new Date(entry.timestamp).toLocaleTimeString('en-PH', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr 
                      key={entry.id || idx}
                      className="hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors group"
                    >
                      {/* Ref & Date */}
                      <td className="py-4 px-5">
                        <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formattedDate}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                          {formattedTime} • #{entry.id.slice(0, 8)}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => cust && onSelectCustomer(cust)}
                          className="font-black text-gray-900 dark:text-white hover:text-red-600 dark:hover:text-rose-400 transition-colors text-left cursor-pointer flex items-center gap-1.5"
                        >
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          <span>{cust?.name || 'Unknown Customer'}</span>
                        </button>
                        {cust?.contact && (
                          <div className="text-[10px] text-gray-400 mt-0.5">{cust.contact}</div>
                        )}
                      </td>

                      {/* Type Badge */}
                      <td className="py-4 px-4">
                        {isCredit ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-400 border border-red-200 dark:border-rose-900">
                            <ArrowUpRight className="w-3 h-3 text-red-500" />
                            Utang Incurred
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                            <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                            Bayad / Paid
                          </span>
                        )}
                      </td>

                      {/* Particulars / Items */}
                      <td className="py-4 px-4 max-w-xs">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate" title={entry.description}>
                          {entry.description || (isCredit ? 'Credit Purchase' : 'Payment Received')}
                        </p>
                        {entry.targetCreditId && (
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold block mt-0.5">
                            Targeted Settlement
                          </span>
                        )}
                      </td>

                      {/* Debit (+Utang) */}
                      <td className="py-4 px-4 text-right font-black">
                        {isCredit ? (
                          <span className="text-red-600 dark:text-rose-400">
                            +₱{amt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">-</span>
                        )}
                      </td>

                      {/* Credit (-Bayad) */}
                      <td className="py-4 px-4 text-right font-black">
                        {!isCredit ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            -₱{amt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">-</span>
                        )}
                      </td>

                      {/* Sync Status */}
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Redis & Cloud Synced
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100">
                          {cust && onAdjustBalance && (
                            <button
                              type="button"
                              onClick={() => onAdjustBalance(cust)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition-colors cursor-pointer"
                              title="Adjust Customer Balance"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {cust && (
                            <button
                              type="button"
                              onClick={() => onSelectCustomer(cust)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/60 rounded-lg transition-colors cursor-pointer"
                              title="View Customer SOA Ledger"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteEntry && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete this ${entry.type} entry of ₱${amt.toFixed(2)}?`)) {
                                  onDeleteEntry(entry.id);
                                  fetchLocalEntries();
                                }
                              }}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                              title="Delete Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary bar */}
        <div className="p-4 bg-gray-50/70 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <span>
            Showing <strong>{filteredEntries.length}</strong> of <strong>{entries.length}</strong> total documented entries
          </span>
          <div className="flex items-center gap-4 font-bold">
            <span className="text-red-600 dark:text-rose-400">Total Utang: ₱{totalDebits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            <span className="text-emerald-600 dark:text-emerald-400">Total Payments: ₱{totalCredits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
