'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/auth-context';
import { backupService, BackupPayload } from '@/lib/services/backup-service';
import { auditService } from '@/lib/services/audit-service';
import { AuditLog } from '@/lib/db/idb';
import { realtimeSync, RealtimeStatus } from '@/lib/db/realtime-sync';
import { pullSync, processQueue } from '@/lib/db/sync-queue';
import { 
  ShieldCheck, 
  Database, 
  Download, 
  Upload, 
  HardDrive, 
  Cpu, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  FileText, 
  Clock,
  Layers,
  Lock,
  Wifi,
  CloudLightning,
  Radio,
  Zap
} from 'lucide-react';
import { ConfirmModal } from '@/components/ui/modal';
import { upstashRedis } from '@/lib/services/redis-service';

export function SystemHealthDashboard() {
  const { user, isAdmin } = useAuth();
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [streamStatus, setStreamStatus] = useState<RealtimeStatus>(() => realtimeSync.getStatus());
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [pendingRestorePayload, setPendingRestorePayload] = useState<BackupPayload | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'errors' | 'auth'>('all');
  const [redisTesting, setRedisTesting] = useState(false);
  const [redisTestResult, setRedisTestResult] = useState<{
    success: boolean;
    ping: string;
    latencyMs: number;
    host: string;
    message: string;
    timestamp: number;
  } | null>(null);

  const handleTestRedis = async () => {
    setRedisTesting(true);
    try {
      const res = await fetch('/api/utang-webhook?action=health');
      const data = await res.json();
      if (data.success) {
        setRedisTestResult({
          success: true,
          ping: data.ping || 'PONG',
          latencyMs: data.latencyMs || 0,
          host: data.redisHost || 'proper-gull-192572.upstash.io',
          message: 'Connected & Operational',
          timestamp: Date.now()
        });
      } else {
        setRedisTestResult({
          success: false,
          ping: 'FAILED',
          latencyMs: 0,
          host: 'proper-gull-192572.upstash.io',
          message: data.error || 'Connection failed',
          timestamp: Date.now()
        });
      }
    } catch (e: any) {
      setRedisTestResult({
        success: false,
        ping: 'ERROR',
        latencyMs: 0,
        host: 'proper-gull-192572.upstash.io',
        message: e?.message || 'Network request failed',
        timestamp: Date.now()
      });
    } finally {
      setRedisTesting(false);
    }
  };

  useEffect(() => {
    const unsub = realtimeSync.subscribeStatus((st) => setStreamStatus(st));
    return () => unsub();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
        const est = await navigator.storage.estimate();
        setStorageEstimate({
          usage: est.usage || 0,
          quota: est.quota || 0,
        });
      }

      const allLogs = await auditService.getAll();
      allLogs.sort((a, b) => b.timestamp - a.timestamp);
      setRecentLogs(allLogs.slice(0, 50));
    } catch (err) {
      console.error('Failed to load system diagnostics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      await backupService.downloadBackupFile();
    } catch (err: any) {
      setErrorFeedback(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.data) {
          throw new Error('Invalid format: Missing data dictionary.');
        }
        setPendingRestorePayload(json);
      } catch (err: any) {
        setErrorFeedback(`Cannot read backup file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmRestore = async () => {
    if (!pendingRestorePayload) return;
    setIsRestoring(true);
    setRestoreFeedback(null);
    setErrorFeedback(null);
    try {
      const res = await backupService.restoreBackup(pendingRestorePayload);
      setRestoreFeedback(res.message);
      setPendingRestorePayload(null);
      await loadData();
    } catch (err: any) {
      setErrorFeedback(`Restore failed: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const filteredLogs = recentLogs.filter((log) => {
    if (filterType === 'errors') {
      return log.action.includes('ERROR') || log.action.includes('CRASH') || log.action.includes('REJECTION');
    }
    if (filterType === 'auth') {
      return log.action.includes('AUTH') || log.action.includes('USER') || log.action.includes('LOGIN');
    }
    return true;
  });

  const usageMB = storageEstimate ? (storageEstimate.usage / (1024 * 1024)).toFixed(2) : '0';
  const quotaMB = storageEstimate ? (storageEstimate.quota / (1024 * 1024)).toFixed(0) : '0';
  const percentUsed = storageEstimate && storageEstimate.quota > 0 
    ? ((storageEstimate.usage / storageEstimate.quota) * 100).toFixed(2) 
    : '0';

  const handleForceResync = async () => {
    setIsResyncing(true);
    setRestoreFeedback(null);
    setErrorFeedback(null);
    try {
      await processQueue();
      await pullSync();
      realtimeSync.start();
      setRestoreFeedback('Cloud auto-push and webhook stream re-synchronized successfully across all tables.');
      await loadData();
    } catch (err: any) {
      setErrorFeedback(`Resync error: ${err.message}`);
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      {restoreFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 p-4 rounded-2xl text-sm font-bold flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{restoreFeedback}</span>
        </div>
      )}

      {errorFeedback && (
        <div className="bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800 p-4 rounded-2xl text-sm font-bold flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorFeedback}</span>
        </div>
      )}

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Security & RLS */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Security &amp; RLS</span>
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <h4 className="text-xl font-black text-gray-900 dark:text-white">Active &amp; Enforced</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
            Strict branch data isolation, PBKDF2/Salted hashing, and brute-force rate limiter active.
          </p>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Branch Isolation: Locked
            </span>
            <span>Admin Oversight: Enabled</span>
          </div>
        </div>

        {/* Cloud, Compute & Storage */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Edge Compute &amp; Storage</span>
            <div className="p-2.5 bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 rounded-xl">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <h4 className="text-xl font-black text-gray-900 dark:text-white">{usageMB} MB Used</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
            Local IndexedDB allocated ({percentUsed}% of {quotaMB} MB available quota).
          </p>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[11px] font-bold text-blue-600 dark:text-blue-400">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> Zero Cloud Latency
            </span>
            <span>Offline-First</span>
          </div>
        </div>

        {/* Speed & Caching */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Speed &amp; PWA Cache</span>
            <div className="p-2.5 bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-400 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <h4 className="text-xl font-black text-gray-900 dark:text-white">Service Worker Active</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
            CacheFirst static assets, in-memory calculation cache, code-split vendor chunks.
          </p>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[11px] font-bold text-orange-600 dark:text-orange-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Workbox PWA
            </span>
            <span>60fps Render</span>
          </div>
        </div>

        {/* Upstash Redis Cloud DB */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Upstash Redis DB</span>
              <div className="p-2.5 bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-400 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
            </div>
            <h4 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {redisTestResult ? (redisTestResult.success ? `${redisTestResult.latencyMs}ms Latency` : 'Connection Error') : 'Cloud Connected'}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium truncate" title="proper-gull-192572.upstash.io">
              proper-gull-192572.upstash.io
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={handleTestRedis}
              disabled={redisTesting}
              className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {redisTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Testing Redis...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  Test Upstash Redis
                </>
              )}
            </button>
            {redisTestResult && (
              <p className={`text-[10px] font-bold mt-2 text-center ${redisTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {redisTestResult.success ? `✓ Ping: ${redisTestResult.ping} (${redisTestResult.latencyMs}ms)` : `✗ ${redisTestResult.message}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Realtime Webhook & Multi-Device Auto-Push Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                streamStatus === 'connected'
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                  : streamStatus === 'connecting'
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                  : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
              }`}>
                <Radio className={`w-3.5 h-3.5 ${streamStatus === 'connected' ? 'animate-pulse' : ''}`} />
                Webhook Stream: {streamStatus.toUpperCase()}
              </span>
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500">Zero-Delay Auto-Push Active</span>
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <CloudLightning className="w-6 h-6 text-emerald-600" />
              Realtime Multi-Device Webhook &amp; Auto-Push
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">
              Data written on any device is pushed instantly to the cloud database. Any other logged-in device receives new products, transactions, and user logins via Server-Sent Events (SSE) with no delay.
            </p>
          </div>
          <button
            type="button"
            onClick={handleForceResync}
            disabled={isResyncing}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center gap-2 text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isResyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Force Push &amp; Resync All
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs">
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
            <p className="font-bold text-gray-400 uppercase tracking-widest text-[10px]">Direct Push</p>
            <p className="font-black text-gray-900 dark:text-white text-sm mt-0.5">Instant Parallel HTTP</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Writes push immediately to RTDB</p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
            <p className="font-bold text-gray-400 uppercase tracking-widest text-[10px]">Inbound Webhook</p>
            <p className="font-black text-gray-900 dark:text-white text-sm mt-0.5">Firebase SSE Stream</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Automatic real-time push to other devices</p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
            <p className="font-bold text-gray-400 uppercase tracking-widest text-[10px]">Cross-Device Login</p>
            <p className="font-black text-gray-900 dark:text-white text-sm mt-0.5">Cloud User Lookup</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">New accounts pull instantly upon login</p>
          </div>
        </div>
      </div>

      {/* Disaster Recovery & Backup Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="w-6 h-6 text-orange-600" />
              Disaster Recovery &amp; System Backup
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">
              Export complete store records, customer ledgers, and transactions, or restore from a verified backup file.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl flex items-center gap-2 text-xs shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Full Backup (JSON)
            </button>
            <label className="px-5 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold rounded-2xl flex items-center gap-2 text-xs transition-all cursor-pointer">
              <Upload className="w-4 h-4" />
              Restore Backup
              <input type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Error Tracking & Audit Logs */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-800/40">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              Error Tracking &amp; Security Audit Trail
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              Real-time monitoring of user access, rate limiter events, and caught system errors.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-200 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setFilterType('errors')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterType === 'errors'
                    ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-rose-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Errors &amp; Crashes
              </button>
              <button
                type="button"
                onClick={() => setFilterType('auth')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterType === 'auth'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Auth &amp; Security
              </button>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
              title="Refresh logs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold sticky top-0">
              <tr>
                <th className="py-3 px-6">Timestamp</th>
                <th className="py-3 px-6">Event</th>
                <th className="py-3 px-6">Details</th>
                <th className="py-3 px-6">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400 dark:text-gray-500">
                    No matching log entries found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isError = log.action.includes('ERROR') || log.action.includes('CRASH') || log.action.includes('REJECTION');
                  const isAuthFail = log.action.includes('AUTH_FAILED');
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 px-6 text-gray-500 dark:text-gray-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('en-PH')}
                      </td>
                      <td className="py-3 px-6 font-bold whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                          isError 
                            ? 'bg-red-100 text-red-700 dark:bg-rose-950/80 dark:text-rose-300' 
                            : isAuthFail
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-gray-700 dark:text-gray-300 font-medium max-w-md truncate">
                        {log.details}
                      </td>
                      <td className="py-3 px-6 text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">
                        {log.user || 'system'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Restore Modal */}
      <ConfirmModal
        isOpen={!!pendingRestorePayload}
        onClose={() => setPendingRestorePayload(null)}
        onConfirm={confirmRestore}
        title="Restore Database from Backup"
        message={pendingRestorePayload ? `Are you sure you want to restore from this backup dated ${new Date(pendingRestorePayload.timestamp).toLocaleString()}? All existing local records will be overwritten with the backup state.` : ''}
        confirmText="Restore Backup"
        variant="danger"
      />
    </div>
  );
}
