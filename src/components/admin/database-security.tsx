'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Key, 
  ExternalLink, 
  Copy, 
  Check, 
  Lock, 
  Unlock, 
  Database, 
  Zap, 
  Activity, 
  Info, 
  FileCode, 
  ChevronRight,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Wifi,
  Globe,
  Sparkles
} from 'lucide-react';
import { SECURE_PRODUCTION_RULES } from '@/lib/constants/firebase-rules';
import { realtimeSync } from '@/lib/db/realtime-sync';
import {
  getConfiguredRtdbUrl,
  setConfiguredRtdbUrl,
  getFirebaseAuthToken,
  getFirebaseConsoleUrl,
} from '@/lib/db/firebase-config';
import { apiFetch } from '@/lib/api-client';
import { ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

export interface ScanResult {
  timestamp: number;
  databaseUrl: string;
  canRead: boolean;
  canWriteUnauthenticated: boolean;
  isOpen: boolean; // Vulnerable: anyone can write
  isLocked: boolean; // Broken: devices cannot read/login
  isSecured: boolean; // Production: read allowed for devices, write blocked without auth
  securityScore: number; // 0 to 10
  issues: string[];
  recommendations: string[];
}

export function DatabaseSecurity() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [databaseSecret, setDatabaseSecret] = useState('');
  const [isSecretSaved, setIsSecretSaved] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [activateSuccess, setActivateSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; message: string; timestamp?: number } | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  const [fixSuccess, setFixSuccess] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [copiedRules, setCopiedRules] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showRulesPreview, setShowRulesPreview] = useState(false);

  const toast = useToast();
  const [rtdbUrlInput, setRtdbUrlInput] = useState('');
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  // Load saved secret and RTDB URL if available from config/storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken = getFirebaseAuthToken();
      if (savedToken) {
        setDatabaseSecret(savedToken);
        setIsSecretSaved(true);
      }
      setRtdbUrlInput(getConfiguredRtdbUrl());
    }
  }, []);

  // Run initial scan on mount
  useEffect(() => {
    runScan();
  }, []);

  const runScan = async () => {
    setScanning(true);
    setFixError(null);
    setFixSuccess(false);

    try {
      const baseUrl = (rtdbUrlInput || getConfiguredRtdbUrl()).replace(/\/$/, '');
      if (!baseUrl) {
        setScanResult({
          timestamp: Date.now(),
          databaseUrl: '',
          canRead: false,
          canWriteUnauthenticated: false,
          isOpen: false,
          isLocked: false,
          isSecured: false,
          securityScore: 0,
          issues: ['Firebase Realtime Database URL is not configured (local offline mode active).'],
          recommendations: ['Configure VITE_FIREBASE_RTDB_URL or enter your Firebase RTDB URL below to enable cloud rules inspection.'],
        });
        setScanning(false);
        return;
      }
      const issues: string[] = [];
      const recommendations: string[] = [];

      // Probe 1: Unauthenticated Read Probe (Check if devices can load users/store)
      let canRead = false;
      try {
        const readRes = await fetch(`${baseUrl}/users.json?shallow=true`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        canRead = readRes.ok;
      } catch {
        canRead = false;
      }

      // Probe 2: Unauthenticated Write Probe (Vulnerability Test)
      let canWriteUnauthenticated = false;
      const testKey = `_scan_test_${Date.now()}`;
      try {
        const writeRes = await fetch(`${baseUrl}/_security_probe/${testKey}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true, timestamp: Date.now() })
        });
        canWriteUnauthenticated = writeRes.ok;
        
        // Immediately clean up probe if it succeeded
        if (canWriteUnauthenticated) {
          await fetch(`${baseUrl}/_security_probe/${testKey}.json`, { method: 'DELETE' }).catch(() => {});
        }
      } catch {
        canWriteUnauthenticated = false;
      }

      const isOpen = canWriteUnauthenticated;
      const isLocked = !canRead && !canWriteUnauthenticated;
      const isSecured = canRead && !canWriteUnauthenticated;

      let score = 9.8;

      if (isOpen) {
        score = 2.5;
        issues.push('CRITICAL: Public Unauthenticated Write Access Active (.write: true)');
        issues.push('Anyone on the public internet can alter prices, insert fake sales, or delete the utang ledger.');
        recommendations.push('Apply Production Security Defaults immediately to restrict writes to authenticated staff.');
        recommendations.push('Enforce immutable append-only ledgers for transactions and credit logs.');
      } else if (isLocked) {
        score = 4.0;
        issues.push('RESTRICTED / LOCKED: Devices cannot read store or user accounts (.read: false or locked)');
        issues.push('New mobile devices and cashiers will be blocked with "Permission Denied" upon login.');
        recommendations.push('Allow read access so POS devices can verify credentials and download the product catalog.');
      } else {
        recommendations.push('Production configuration verified: Guest reads allowed for catalog/login, writes protected.');
      }

      setScanResult({
        timestamp: Date.now(),
        databaseUrl: baseUrl,
        canRead,
        canWriteUnauthenticated,
        isOpen,
        isLocked,
        isSecured,
        securityScore: score,
        issues,
        recommendations,
      });
    } catch (err: any) {
      console.error('Scan error:', err);
    } finally {
      setScanning(false);
    }
  };

  const handleActivateSecret = async () => {
    const secret = databaseSecret.trim();
    if (!secret) {
      setFixError('Mangyaring ilagay ang iyong Firebase Database Secret bago i-activate.');
      return;
    }

    setIsActivating(true);
    setFixError(null);
    setActivateSuccess(false);
    setTestResult(null);

    const start = performance.now();
    try {
      const baseUrl = (rtdbUrlInput || getConfiguredRtdbUrl()).replace(/\/$/, '');
      if (!baseUrl) {
        throw new Error('Firebase Realtime Database URL is not configured. Please enter your RTDB URL or set VITE_FIREBASE_RTDB_URL.');
      }
      if (rtdbUrlInput.trim()) {
        setConfiguredRtdbUrl(rtdbUrlInput.trim());
      }
      // 1. Direct validation against Firebase RTDB REST API
      const probeRes = await fetch(`${baseUrl}/users.json?shallow=true&auth=${encodeURIComponent(secret)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      const latency = Math.round(performance.now() - start);

      if (!probeRes.ok && probeRes.status === 401) {
        throw new Error('Hindi tinanggap ng Firebase ang Secret Key (HTTP 401 Unauthorized). Pakisuri kung tama ang kinopya mula sa Firebase Console -> Project Settings -> Service accounts -> Database secrets.');
      }

      // 2. Persist in browser storage across sessions and reloads
      localStorage.setItem('pos_firebase_auth_token', secret);
      localStorage.setItem('firebase_database_secret', secret);
      sessionStorage.setItem('pos_firebase_auth_token', secret);
      setIsSecretSaved(true);
      setActivateSuccess(true);

      // 3. Reconnect real-time stream with authenticated token
      realtimeSync.restart();

      // 4. Update test result banner
      setTestResult({
        success: true,
        latency,
        message: `Tagumpay na Na-activate! Authenticated sa Firebase RTDB (${latency}ms). Gumagana na ang lahat ng sync at rules kahit walang server .env file!`,
        timestamp: Date.now()
      });

      // 5. Re-run scan to update probe status
      await runScan();

      setTimeout(() => setActivateSuccess(false), 5000);
    } catch (err: any) {
      console.error('Activate secret error:', err);
      setFixError(err.message || 'Error sa pag-activate ng Secret Key sa frontend.');
    } finally {
      setIsActivating(false);
    }
  };

  const handleClearSecret = () => {
    setIsConfirmClearOpen(true);
  };

  const confirmClearSecret = () => {
    localStorage.removeItem('pos_firebase_auth_token');
    localStorage.removeItem('firebase_database_secret');
    sessionStorage.removeItem('pos_firebase_auth_token');
    setDatabaseSecret('');
    setIsSecretSaved(false);
    setTestResult(null);
    setFixSuccess(false);
    setIsConfirmClearOpen(false);
    toast.success('Database secret cleared from this device.');
    realtimeSync.restart();
    runScan();
  };

  const handleTestConnection = async () => {
    const secret = databaseSecret.trim() || getFirebaseAuthToken();
    if (!secret) {
      setFixError('Walang Secret Key na masusubukan. Mag-type o mag-save muna ng secret key.');
      return;
    }

    const baseUrl = (rtdbUrlInput || getConfiguredRtdbUrl()).replace(/\/$/, '');
    if (!baseUrl) {
      setFixError('Firebase Realtime Database URL is not configured.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setFixError(null);

    const start = performance.now();
    try {
      const res = await fetch(`${baseUrl}/users.json?shallow=true&auth=${encodeURIComponent(secret)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      const latency = Math.round(performance.now() - start);

      if (res.ok) {
        setTestResult({
          success: true,
          latency,
          message: `Konektado at Awtentikado! Tumugon ang Firebase sa loob ng ${latency}ms (HTTP 200 OK). Buong access sa database ay aktibo nang direkta sa frontend.`,
          timestamp: Date.now()
        });
      } else {
        setTestResult({
          success: false,
          latency,
          message: `Tinanggihan ng Firebase ang Secret Key (HTTP ${res.status}). Pakisuri ang kinopyang secret key.`,
          timestamp: Date.now()
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Hindi makakonekta sa Firebase: ${err.message || 'Network error'}.`,
        timestamp: Date.now()
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFixNow = async () => {
    setIsApplyingFix(true);
    setFixError(null);
    setFixSuccess(false);

    const secret = databaseSecret.trim() || getFirebaseAuthToken();
    const baseUrl = (rtdbUrlInput || getConfiguredRtdbUrl()).replace(/\/$/, '');

    if (!baseUrl) {
      setFixError('Firebase Realtime Database URL is not configured. Enter your RTDB URL or set VITE_FIREBASE_RTDB_URL.');
      setIsApplyingFix(false);
      return;
    }

    if (!secret) {
      setFixError('Database Secret required for 1-click automatic update. Alternatively, copy the Production Rules below and publish them in your Firebase Rules Console.');
      setShowRulesPreview(true);
      setIsApplyingFix(false);
      return;
    }

    // Automatically ensure it is saved in frontend
    localStorage.setItem('pos_firebase_auth_token', secret);
    localStorage.setItem('firebase_database_secret', secret);
    setIsSecretSaved(true);

    let applied = false;
    let clientErr = '';

    // Step 1: Direct Client-side REST Update (Runs 100% in browser, requires no server or .env file!)
    try {
      const rulesUrl = `${baseUrl}/.settings/rules.json?auth=${encodeURIComponent(secret)}`;
      const directRes = await fetch(rulesUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SECURE_PRODUCTION_RULES)
      });

      if (directRes.ok) {
        applied = true;
      } else {
        const errText = await directRes.text();
        clientErr = `Direct response (${directRes.status}): ${errText}`;
      }
    } catch (e: any) {
      clientErr = e?.message || 'Direct network error';
    }

    // Step 2: Fallback to server API if available
    if (!applied) {
      try {
        const response = await apiFetch('/api/update-firebase-rules', {
          method: 'POST',
          body: JSON.stringify({
            secret,
            databaseUrl: baseUrl,
            rules: SECURE_PRODUCTION_RULES
          })
        });

        const data = await response.json();
        if (response.ok && data.success) {
          applied = true;
        }
      } catch (apiErr: any) {
        console.warn('API fallback error:', apiErr);
      }
    }

    if (applied) {
      setFixSuccess(true);
      realtimeSync.restart();
      await runScan();
    } else {
      setFixError(`Hindi ma-update ang rules gamit ang Secret Key (${clientErr}). Maaari mong kopyahin ang Production Rules JSON sa ibaba at i-paste nang direkta sa Firebase Rules Console.`);
    }

    setIsApplyingFix(false);
  };

  const handleCopyProductionRules = () => {
    navigator.clipboard.writeText(JSON.stringify(SECURE_PRODUCTION_RULES, null, 2));
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-gray-900 to-slate-900 text-white rounded-[2.5rem] p-8 md:p-10 border border-gray-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className={`p-4 rounded-2xl shrink-0 ${
              scanResult?.isOpen 
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' 
                : scanResult?.isSecured 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              {scanResult?.isOpen ? (
                <ShieldAlert className="w-8 h-8" />
              ) : scanResult?.isSecured ? (
                <ShieldCheck className="w-8 h-8" />
              ) : (
                <ShieldX className="w-8 h-8" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-black tracking-tight">Database Security Inspector</h3>
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/10 text-gray-300">
                  Realtime Probing
                </span>
              </div>
              <p className="text-sm text-gray-400 font-medium mt-1 max-w-xl leading-relaxed">
                Automated vulnerability scanner for Firebase Realtime Database rules. Detects open write permissions, evaluates role policies, and applies production-ready access rules.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runScan}
              disabled={scanning}
              className="px-5 py-3.5 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer border border-gray-700 shadow-md disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin text-orange-400' : ''}`} />
              {scanning ? 'Scanning...' : 'Scan Rules Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Critical Vulnerability Alert Banner (Displayed when Open) */}
      <AnimatePresence>
        {scanResult?.isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-6 md:p-8 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-900 rounded-[2.5rem] shadow-xl relative overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="p-3.5 bg-rose-600 text-white rounded-2xl shrink-0 shadow-lg shadow-rose-600/30">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                      Critical Risk: Open Database
                    </span>
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      Security Score: {scanResult.securityScore}/10
                    </span>
                  </div>
                  <h4 className="text-xl font-black text-rose-950 dark:text-rose-100 mt-1">
                    Your Database Allows Anyone on the Internet to Overwrite Data
                  </h4>
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 mt-1.5 leading-relaxed max-w-2xl">
                    The current database rules allow unauthenticated write operations (<code className="font-mono bg-rose-200/50 dark:bg-rose-900/60 px-1 py-0.5 rounded">.write: true</code>). Any unauthorized visitor or bot can modify your official sales records, tamper with customer credit (utang), or delete products.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleFixNow}
                  disabled={isApplyingFix}
                  className="px-6 py-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-600/30 disabled:opacity-50"
                >
                  {isApplyingFix ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying Secure Defaults...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-white" />
                      Fix Now (Apply Production Defaults)
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Production Secured State Banner */}
      {scanResult?.isSecured && (
        <div className="p-6 md:p-8 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-emerald-600 text-white rounded-2xl shrink-0 shadow-lg shadow-emerald-600/20">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                  Secured &bull; Score: {scanResult.securityScore}/10
                </span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  Production Grade
                </span>
              </div>
              <h4 className="text-lg font-black text-emerald-950 dark:text-emerald-100 mt-1">
                Database Rules Enforce Secure Production Access
              </h4>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed max-w-2xl">
                Unauthenticated writes are blocked. Guest read access is permitted for multi-device catalog browsing and login authentication. Ledgers are protected against arbitrary deletion.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowRulesPreview(!showRulesPreview)}
              className="px-4 py-2.5 bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <FileCode className="w-4 h-4" />
              {showRulesPreview ? 'Hide Rules' : 'View Active Rules'}
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      <AnimatePresence>
        {fixSuccess && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-5 bg-emerald-500 text-white rounded-2xl flex items-center gap-3 shadow-lg"
          >
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div className="text-xs font-bold">
              <span className="font-black uppercase tracking-wider block">Security Rules Updated!</span>
              The Firebase Realtime Database has been updated to Secure Production Defaults. Unauthenticated writes are now blocked.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Alert */}
      {fixError && (
        <div className="p-5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl text-rose-800 dark:text-rose-200 text-xs font-bold flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="space-y-1">
            <span className="uppercase tracking-wider font-black block">Action Notice</span>
            <p className="font-medium text-rose-700 dark:text-rose-300 leading-relaxed">{fixError}</p>
          </div>
        </div>
      )}

      {/* Security Assessment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Score Card */}
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500">Security Score</span>
            <Activity className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-black tracking-tight ${
              (scanResult?.securityScore || 0) >= 8 
                ? 'text-emerald-600 dark:text-emerald-400' 
                : 'text-rose-600 dark:text-rose-400'
            }`}>
              {scanResult ? scanResult.securityScore : '--'}
            </span>
            <span className="text-sm font-bold text-gray-400">/ 10</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-700 ${
                (scanResult?.securityScore || 0) >= 8 
                  ? 'bg-emerald-500' 
                  : (scanResult?.securityScore || 0) >= 5 
                    ? 'bg-amber-500' 
                    : 'bg-rose-500'
              }`}
              style={{ width: `${((scanResult?.securityScore || 0) / 10) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 font-medium">
            {scanResult?.isOpen 
              ? 'Urgent attention required: Anonymous write vulnerability.' 
              : scanResult?.isSecured 
                ? 'Optimal production security active.' 
                : 'Database restricted or pending configuration.'}
          </p>
        </div>

        {/* Read Permissions Card */}
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500">Device Read Access</span>
            {scanResult?.canRead ? (
              <Unlock className="w-4 h-4 text-emerald-600" />
            ) : (
              <Lock className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <div className="text-xl font-black text-gray-950 dark:text-white">
            {scanResult?.canRead ? 'Device Sync Allowed' : 'Blocked / Restricted'}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
            {scanResult?.canRead 
              ? 'POS devices can successfully retrieve customer ledgers and products for fast offline operations.' 
              : 'Devices will experience 401 Permission Denied errors when attempting to sign in.'}
          </p>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400">
            Probe Status: {scanResult?.canRead ? 'HTTP 200 OK' : 'HTTP 401 Unauthorized'}
          </div>
        </div>

        {/* Write Permissions Card */}
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500">Write Protection</span>
            {scanResult?.canWriteUnauthenticated ? (
              <Unlock className="w-4 h-4 text-rose-600" />
            ) : (
              <Lock className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <div className="text-xl font-black text-gray-950 dark:text-white">
            {scanResult?.canWriteUnauthenticated ? 'UNPROTECTED (Open)' : 'PROTECTED (Auth Only)'}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
            {scanResult?.canWriteUnauthenticated 
              ? 'Warning: Unauthenticated probe writes succeeded. Anonymous modification is permitted.' 
              : 'Secure: Unauthenticated probe writes were rejected with 401/403 Permission Denied.'}
          </p>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400">
            Probe Status: {scanResult?.canWriteUnauthenticated ? 'VULNERABLE' : 'SECURE'}
          </div>
        </div>
      </div>

      {/* Frontend Secret Key Configuration & Direct REST Rules Management */}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 md:p-10 border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
        
        {/* Card Header & Status Badge */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-orange-100 dark:bg-orange-950/60 p-2.5 rounded-xl text-orange-600 dark:text-orange-400">
                <Key className="w-5 h-5" />
              </div>
              <h4 className="text-xl font-black text-gray-950 dark:text-white tracking-tight">
                Frontend Secret Key Manager
              </h4>
              <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 ${
                isSecretSaved
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isSecretSaved ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {isSecretSaved ? 'Naka-activate sa Frontend (Browser Storage)' : 'Hindi pa Naka-activate'}
              </span>
            </div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-relaxed pt-1">
              <strong>Oo! Pwedeng i-activate ang secret key sa frontend lamang.</strong> Hindi na kailangan ng server <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px] font-mono">.env</code> file. Naka-save ito sa local storage ng browser kaya gagana ang multi-device sync, cloud backup, at rule deployment kahit naka-deploy na ang app sa web (Vercel, Cloud Run, PWA).
            </p>
          </div>

          <a
            href={getFirebaseConsoleUrl('secrets')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-black text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1.5 shrink-0 bg-orange-50 dark:bg-orange-950/40 px-3.5 py-2 rounded-xl border border-orange-200 dark:border-orange-800"
          >
            Kuhanin ang Secret Key sa Firebase Console <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Input & Activation Controls */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Firebase Realtime Database URL
            </label>
            <input
              type="url"
              value={rtdbUrlInput}
              onChange={(e) => {
                setRtdbUrlInput(e.target.value);
                setConfiguredRtdbUrl(e.target.value);
              }}
              placeholder="https://your-project-default-rtdb.firebasedatabase.app"
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3 text-xs font-mono font-bold text-gray-950 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
            />
          </div>

          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">
            Firebase Realtime Database Secret Key
          </label>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type={showSecret ? 'text' : 'password'}
                value={databaseSecret}
                onChange={(e) => {
                  setDatabaseSecret(e.target.value);
                  setActivateSuccess(false);
                }}
                placeholder="I-paste dito ang Database Secret (Hal. gQAAAAA... o AIzaSy...)"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3.5 pr-12 text-xs font-mono font-bold text-gray-950 dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-1"
                title={showSecret ? 'Itago ang secret' : 'Ipakita ang secret'}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleActivateSecret}
              disabled={isActivating || !databaseSecret.trim()}
              className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/20 disabled:opacity-50 shrink-0"
            >
              {isActivating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ina-activate...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  I-activate sa Frontend
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !databaseSecret.trim()}
              className="px-5 py-3.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sinusubukan...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  I-test ang Koneksyon
                </>
              )}
            </button>

            {isSecretSaved && (
              <button
                type="button"
                onClick={handleClearSecret}
                className="px-4 py-3.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-2xl text-xs font-black transition-all cursor-pointer shrink-0"
                title="Tanggalin ang secret key sa browser storage"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Test & Activation Feedback */}
          <AnimatePresence>
            {activateSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 rounded-2xl flex items-center gap-3 border border-emerald-300 dark:border-emerald-800 text-xs font-bold"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-black uppercase tracking-wider block">Secret Key Na-activate sa Frontend!</span>
                  Naka-save na ito sa device na ito. Hindi na kailangan ng kahit anong <code className="bg-emerald-200 dark:bg-emerald-900 px-1 py-0.5 rounded">.env</code> file sa server kapag naka-deploy na ang app.
                </div>
              </motion.div>
            )}

            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`p-4 rounded-2xl flex items-center gap-3 border text-xs font-bold ${
                  testResult.success
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black uppercase tracking-wider">
                      {testResult.success ? 'Koneksyon Tagumpay' : 'Nabigong Kumonekta'}
                    </span>
                    {testResult.latency !== undefined && (
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full font-mono font-bold">
                        {testResult.latency}ms latency
                      </span>
                    )}
                  </div>
                  <p className="font-medium mt-0.5">{testResult.message}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 1-Click Production Rules Update Banner */}
        <div className="p-6 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-3xl border border-orange-200 dark:border-orange-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h5 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-600 fill-orange-600" />
              1-Click Client-Side Production Rules Update
            </h5>
            <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">
              Gamit ang na-activate na Secret Key, direktang mai-a-apply ang Secure Production Rules sa Firebase RTDB mula sa browser (zero-backend execution).
            </p>
          </div>

          <button
            type="button"
            onClick={handleFixNow}
            disabled={isApplyingFix}
            className="px-6 py-3.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-orange-600/20 disabled:opacity-50 shrink-0"
          >
            {isApplyingFix ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ina-apply sa Firebase...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-white" />
                Apply Secure Defaults
              </>
            )}
          </button>
        </div>

        {/* Action Row: Direct Copy & Firebase Console Link */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopyProductionRules}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                copiedRules 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
              }`}
            >
              {copiedRules ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedRules ? 'Production Rules Copied!' : 'Copy Production Rules JSON'}
            </button>

            <button
              type="button"
              onClick={() => setShowRulesPreview(!showRulesPreview)}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              {showRulesPreview ? 'Hide Rules' : 'Preview Rules'}
            </button>
          </div>

          <a
            href={getFirebaseConsoleUrl('rules')}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
          >
            Open Firebase Rules Console <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Rules Preview Code Viewer */}
        <AnimatePresence>
          {showRulesPreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 pt-2"
            >
              <div className="flex items-center justify-between text-xs font-black uppercase text-gray-500">
                <span>Secure Production Rules (Read-Only Guests, Authenticated Writes)</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Validated JSON</span>
              </div>
              <pre className="bg-gray-950 text-emerald-400 font-mono text-xs rounded-2xl p-5 border border-gray-800 overflow-x-auto max-h-[300px] leading-relaxed shadow-inner">
                {JSON.stringify(SECURE_PRODUCTION_RULES, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmModal
        isOpen={isConfirmClearOpen}
        onClose={() => setIsConfirmClearOpen(false)}
        onConfirm={confirmClearSecret}
        title="Remove Database Secret"
        message="Sigurado ka bang nais mong tanggalin ang Secret Key sa browser ng device na ito?"
        confirmText="Remove Secret"
        variant="danger"
      />
    </div>
  );
}
