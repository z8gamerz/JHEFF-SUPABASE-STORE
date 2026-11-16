'use client';

import { useState, useMemo } from 'react';
import { useAuditLogs } from '@/lib/hooks/use-audit-logs';
import { motion } from 'motion/react';
import { 
  ClipboardList, 
  ArrowLeft, 
  Search, 
  Calendar, 
  User, 
  Activity,
  ChevronRight,
  Filter,
  RefreshCw,
  Clock,
  Trash2,
  Check,
  Database,
  ShieldCheck,
  Sparkles,
  Sliders
} from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/toast';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function AuditTrailPage() {
  const { 
    logs, 
    loading, 
    ttlDays, 
    setTtlDays, 
    autoPurgeEnabled, 
    setAutoPurgeEnabled, 
    cleanExpiredNow, 
    isPurging, 
    refresh 
  } = useAuditLogs();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [purgeSuccessMsg, setPurgeSuccessMsg] = useState<string | null>(null);
  const toast = useToast();

  const cutoffMs = useMemo(() => Date.now() - (ttlDays * 24 * 60 * 60 * 1000), [ttlDays]);
  const expiredLogsCount = useMemo(() => logs.filter(l => (l.timestamp || 0) < cutoffMs).length, [logs, cutoffMs]);

  const handlePurgeNow = async () => {
    try {
      const res = await cleanExpiredNow();
      if (res.deletedCount > 0) {
        setPurgeSuccessMsg(`Nalinis at na-purge ang ${res.deletedCount} lumang logs na lampas na sa ${ttlDays} araw!`);
      } else {
        setPurgeSuccessMsg(`Ligtas ang database! Lahat ng logs ay pasok pa sa ${ttlDays}-day TTL retention rule.`);
      }
      setTimeout(() => setPurgeSuccessMsg(null), 5000);
    } catch (err: any) {
      toast.error('Log Cleanup Failed', err?.message || 'Error cleaning expired logs.');
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.user && log.user.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    
    return matchesSearch && matchesAction;
  });

  const actionTypes = Array.from(new Set(logs.map(l => l.action))) as string[];

  const getActionColor = (action: string) => {
    if (action.includes('TRANSACTION')) return 'bg-green-100 text-green-700';
    if (action.includes('PRODUCT')) return 'bg-blue-100 text-blue-700';
    if (action.includes('STORE')) return 'bg-purple-100 text-purple-700';
    if (action.includes('DELETE')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors">
      <Header />
      
      <div className="p-3 sm:p-6 lg:p-8 w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-6">
            <Link 
              href="/settings"
              className="p-4 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl transition-all text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white border border-gray-100 dark:border-gray-800 shadow-sm"
            >
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-4xl font-black text-gray-950 dark:text-white tracking-tighter leading-tight uppercase">Audit Trail</h1>
              <p className="text-gray-600 dark:text-gray-300 font-bold mt-1 text-sm">Monitor all significant actions and changes within the system.</p>
            </div>
          </div>

          <button 
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-all text-gray-950 dark:text-white border border-gray-100 dark:border-gray-800 shadow-sm font-black text-xs uppercase tracking-widest cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Logs
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 space-y-6 transition-colors">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 ml-2">Search Logs</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search details..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-950 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-bold placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 ml-2">Action Type</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterAction('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                      filterAction === 'all' 
                        ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    All
                  </button>
                  {actionTypes.map(type => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setFilterAction(type)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                        filterAction === type 
                          ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20' 
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {type.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Audit Log TTL & Database Storage Retention Card */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 space-y-5 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 rounded-xl">
                    <Database className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-gray-950 dark:text-white">
                      Storage TTL Rule
                    </h3>
                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      Auto-purge rule para di mapuno ang database
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Active
                </span>
              </div>

              {/* TTL Days Selector */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 block mb-2">
                  Retention Period:
                </label>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {[7, 14, 30, 60, 90].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setTtlDays(days)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                        ttlDays === days
                          ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {days === 30 ? '30d (Def)' : `${days}d`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Custom:</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={ttlDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) setTtlDays(val);
                    }}
                    className="w-16 px-2 py-1 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-950 dark:text-white rounded-lg font-bold text-xs outline-none focus:border-orange-500"
                  />
                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">araw (days)</span>
                </div>
              </div>

              {/* Retention Metrics */}
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-400 font-bold text-[11px]">Kabuuang Logs:</span>
                  <span className="font-black text-gray-900 dark:text-white">{logs.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-400 font-bold text-[11px]">Pasok sa {ttlDays} araw:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{logs.length - expiredLogsCount} logs</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-400 font-bold text-[11px]">Expired para i-purge:</span>
                  <span className={`font-black ${expiredLogsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}>
                    {expiredLogsCount} logs
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-bold">
                  <span>Purge cutoff bago:</span>
                  <span>{format(new Date(cutoffMs), 'MMM d, yyyy')}</span>
                </div>
              </div>

              {/* Auto-Purge Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoPurgeEnabled}
                  onChange={(e) => setAutoPurgeEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  Auto-purge expired logs sa load
                </span>
              </label>

              {/* Purge Action Button */}
              <button
                type="button"
                disabled={isPurging}
                onClick={handlePurgeNow}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                title={`I-purge ang mga logs na mas matanda sa ${ttlDays} araw`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isPurging ? 'Nililinis...' : `Purge Logs (> ${ttlDays}d)`}</span>
              </button>
            </div>

            <div className="bg-orange-600 p-8 rounded-[2rem] text-white shadow-xl shadow-orange-500/20">
              <Activity className="w-8 h-8 mb-4 opacity-80" />
              <h3 className="text-2xl font-black tracking-tight mb-2">System Integrity</h3>
              <p className="text-orange-100 text-sm font-bold leading-relaxed">
                Naka-activate ang TTL cleanup rule para manatiling mabilis at magaan ang IndexedDB at Cloud Realtime Database.
              </p>
            </div>
          </div>

          {/* Logs List */}
          <div className="lg:col-span-3 space-y-4">
            {purgeSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-100 dark:bg-emerald-950/90 text-emerald-950 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-800 flex items-center gap-3 text-xs font-bold animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[3] shrink-0" />
                <span>{purgeSuccessMsg}</span>
              </div>
            )}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-300 font-black text-xs uppercase tracking-widest">Loading Audit Logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800 text-center px-6">
                <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-full mb-6">
                  <ClipboardList className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-xl font-black text-gray-950 dark:text-white uppercase tracking-tight mb-2">No logs found</h3>
                <p className="text-gray-600 dark:text-gray-300 max-w-xs mx-auto font-bold text-sm">Try adjusting your search or filters to find what you&apos;re looking for.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map((log, index) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 hover:border-orange-200 dark:hover:border-orange-800 hover:shadow-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                  >
                    <div className="flex items-start gap-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-lg ${getActionColor(log.action)}`}>
                        {log.action.charAt(0)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getActionColor(log.action)}`}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                          <span className="text-gray-300 dark:text-gray-600 text-xs">•</span>
                          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                            <Calendar className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {format(log.timestamp, 'MMM dd, yyyy • hh:mm a')}
                            </span>
                          </div>
                        </div>
                        <p className="text-gray-950 dark:text-white font-black text-lg leading-tight">
                          {log.details.startsWith('{') ? (
                            (() => {
                              try {
                                const details = JSON.parse(log.details);
                                if (log.action === 'TRANSACTION_COMPLETE') {
                                  return `Transaction ${details.orNumber || details.ticketNumber} completed for ₱${details.total.toLocaleString()}`;
                                }
                                if (log.action.startsWith('PRODUCT_')) {
                                  return `${log.action.replace('PRODUCT_', '').toLowerCase()} product: ${details.name || details.id}`;
                                }
                                return log.details;
                              } catch (e) {
                                return log.details;
                              }
                            })()
                          ) : log.details}
                        </p>
                        {log.user && (
                          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <User className="w-3 h-3" />
                            <span className="text-[10px] font-black uppercase tracking-wider">{log.user}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="hidden md:block h-10 w-px bg-gray-100" />
                      <button className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-orange-50 hover:text-orange-600 transition-all">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </AuthGuard>
  );
}
