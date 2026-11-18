'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Database,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Server,
  UploadCloud,
  DownloadCloud,
  Wifi,
  ShieldCheck,
  LogIn,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import {
  CloudProvider,
  getCloudProvider,
  getConfiguredSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseMode,
  setCloudProvider,
  setConfiguredSupabaseUrl,
  setSupabaseAnonKey,
  setSupabaseMode,
  SupabaseConnectionMode,
} from '@/lib/db/cloud-provider';
import {
  getSupabaseAuthSessionEmail,
  pushAllLocalToSupabase,
  resetSupabaseClientCache,
  signInSupabaseAuth,
  signOutSupabaseAuth,
  SupabaseTestResult,
  testSupabaseConnection,
} from '@/lib/db/supabase-sync';
import { pullSync, processQueue } from '@/lib/db/sync-queue';
import { realtimeSync } from '@/lib/db/realtime-sync';

const USER_PROJECT_URL_HINT = 'https://fcklgcvneovhtirmwvst.supabase.co';

export function CloudProviderCard() {
  const [activeProvider, setActiveProvider] = useState<CloudProvider>(() => getCloudProvider());
  const [mode, setMode] = useState<SupabaseConnectionMode>(() => getSupabaseMode());
  const [supabaseUrl, setSupabaseUrl] = useState<string>(
    () => getConfiguredSupabaseUrl() || USER_PROJECT_URL_HINT
  );
  const [anonKey, setAnonKey] = useState<string>(() => getSupabaseAnonKey());
  const [showKey, setShowKey] = useState(false);

  const [showAuthBox, setShowAuthBox] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSessionEmail, setAuthSessionEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [testing, setTesting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  const [pullingAll, setPullingAll] = useState(false);
  const [testResult, setTestResult] = useState<SupabaseTestResult | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const onProviderChange = (e: any) => {
      const next = e?.detail?.provider || getCloudProvider();
      setActiveProvider(next);
    };
    window.addEventListener('pos_cloud_provider_changed', onProviderChange);
    getSupabaseAuthSessionEmail().then((email) => setAuthSessionEmail(email));
    return () => {
      window.removeEventListener('pos_cloud_provider_changed', onProviderChange);
    };
  }, []);

  const persistInputs = (): boolean => {
    setActionMessage(null);
    setSupabaseMode(mode);
    if (mode === 'direct') {
      setConfiguredSupabaseUrl(supabaseUrl);
      try {
        setSupabaseAnonKey(anonKey);
      } catch (err: any) {
        setActionMessage({
          type: 'error',
          text: err?.message || 'Invalid Supabase key.',
        });
        return false;
      }
      resetSupabaseClientCache();
    }
    return true;
  };

  const handleTestSupabase = async (): Promise<SupabaseTestResult | null> => {
    if (!persistInputs()) return null;
    setTesting(true);
    setActionMessage(null);
    try {
      const res = await testSupabaseConnection({
        url: supabaseUrl,
        anonKey,
        mode,
      });
      setTestResult(res);
      if (res.authSessionEmail !== undefined) {
        setAuthSessionEmail(res.authSessionEmail || null);
      }
      return res;
    } finally {
      setTesting(false);
    }
  };

  const handleActivateSupabase = async () => {
    if (!persistInputs()) return;
    setActivating(true);
    setActionMessage(null);
    try {
      const res = await testSupabaseConnection({
        url: supabaseUrl,
        anonKey,
        mode,
      });
      setTestResult(res);

      if (!res.reachable || !res.tablesFound) {
        setActionMessage({
          type: 'error',
          text: `Supabase sync NOT activated: ${res.message} Staying safely on ${activeProvider === 'firebase' ? 'Firebase RTDB' : 'current provider'}.`,
        });
        return;
      }

      if (!res.rlsReadable || !res.rlsWritable) {
        setActionMessage({
          type: 'error',
          text: `Connection reached Supabase, but write/RLS check failed: ${res.message} Fix auth/proxy first or switch back to Firebase anytime.`,
        });
        return;
      }

      setCloudProvider('supabase');
      setActiveProvider('supabase');
      realtimeSync.restart();
      await processQueue().catch(() => {});
      setActionMessage({
        type: 'success',
        text: 'Switched active cloud database to Supabase PostgreSQL! You can revert to Firebase anytime with 1 click.',
      });
    } finally {
      setActivating(false);
    }
  };

  const handleRevertToFirebase = () => {
    setCloudProvider('firebase');
    setActiveProvider('firebase');
    realtimeSync.restart();
    setActionMessage({
      type: 'success',
      text: 'Reverted active cloud sync back to Firebase Realtime Database. Local IndexedDB data is intact.',
    });
  };

  const handleSupabaseAuthSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persistInputs()) return;
    setAuthLoading(true);
    setActionMessage(null);
    try {
      const res = await signInSupabaseAuth(authEmail, authPassword);
      if (!res.success) {
        setActionMessage({ type: 'error', text: res.error || 'Supabase sign-in failed.' });
      } else {
        setAuthSessionEmail(res.email || authEmail);
        setAuthPassword('');
        setActionMessage({
          type: 'success',
          text: `Signed in to Supabase Auth as ${res.email}. Re-testing RLS permissions...`,
        });
        await handleTestSupabase();
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSupabaseAuthSignOut = async () => {
    setAuthLoading(true);
    try {
      await signOutSupabaseAuth();
      setAuthSessionEmail(null);
      setActionMessage({ type: 'success', text: 'Signed out of Supabase Auth session.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePushAllToSupabase = async () => {
    if (!persistInputs()) return;
    setPushingAll(true);
    setActionMessage(null);
    try {
      const progress = await pushAllLocalToSupabase();
      if (progress.errors.length > 0) {
        setActionMessage({
          type: 'error',
          text: `Pushed ${progress.pushedRows} rows, with ${progress.errors.length} table error(s): ${progress.errors[0]}`,
        });
      } else {
        setActionMessage({
          type: 'success',
          text: `Successfully pushed ${progress.pushedRows} local records across all 14 tables to Supabase PostgreSQL!`,
        });
        await handleTestSupabase();
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Push to Supabase failed.',
      });
    } finally {
      setPushingAll(false);
    }
  };

  const handlePullFromSupabase = async () => {
    if (!persistInputs()) return;
    setPullingAll(true);
    setActionMessage(null);
    const previousProvider = getCloudProvider();
    try {
      if (previousProvider !== 'supabase') {
        setCloudProvider('supabase');
      }
      await pullSync();
      setActionMessage({
        type: 'success',
        text: 'Pulled & merged latest records from Supabase into local IndexedDB (Last-Write-Wins).',
      });
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Pull from Supabase failed.',
      });
    } finally {
      if (previousProvider !== 'supabase' && activeProvider !== 'supabase') {
        setCloudProvider(previousProvider);
      }
      setPullingAll(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 md:p-10 border border-gray-100 dark:border-gray-800 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-emerald-100 dark:bg-emerald-950/60 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <h4 className="text-xl font-black text-gray-950 dark:text-white tracking-tight">
              Cloud Database Provider (Firebase RTDB ↔ Supabase)
            </h4>
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1.5 border ${
                activeProvider === 'supabase'
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  activeProvider === 'supabase' ? 'bg-emerald-500' : 'bg-orange-500'
                }`}
              />
              Active: {activeProvider === 'supabase' ? 'Supabase PostgreSQL' : 'Firebase RTDB'}
            </span>
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-relaxed pt-1">
            Test connecting to your Supabase database cleanly while keeping Firebase RTDB ready as a 1-click fallback. Local IndexedDB always stores everything offline-first so switching providers never loses data.
          </p>
        </div>

        {activeProvider === 'supabase' && (
          <button
            type="button"
            onClick={handleRevertToFirebase}
            className="px-5 py-3 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-orange-600/20 shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
            Switch Back to Firebase
          </button>
        )}
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`p-5 rounded-3xl border-2 transition-all flex items-start justify-between gap-4 ${
            activeProvider === 'firebase'
              ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20'
              : 'border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-orange-600 text-white shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h5 className="font-black text-sm text-gray-900 dark:text-white">
                  Firebase Realtime Database
                </h5>
                {activeProvider === 'firebase' && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-600 text-white">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Default sync via REST &amp; SSE stream. Configure URL &amp; secret key below.
              </p>
            </div>
          </div>
          {activeProvider !== 'firebase' && (
            <button
              type="button"
              onClick={handleRevertToFirebase}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider cursor-pointer shrink-0"
            >
              Revert
            </button>
          )}
        </div>

        <div
          className={`p-5 rounded-3xl border-2 transition-all flex items-start justify-between gap-4 ${
            activeProvider === 'supabase'
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h5 className="font-black text-sm text-gray-900 dark:text-white">
                  Supabase PostgreSQL
                </h5>
                {activeProvider === 'supabase' && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                14 PostgreSQL tables + PostgREST + Realtime channel subscriptions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Switch */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mr-2">
          Connection Mode:
        </span>
        <button
          type="button"
          onClick={() => {
            setMode('direct');
            setSupabaseMode('direct');
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            mode === 'direct'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Direct Browser (Anon / Publishable Key)
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('proxy');
            setSupabaseMode('proxy');
          }}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            mode === 'proxy'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Server Proxy (/api/supabase-sync)
        </button>
      </div>

      {/* Inputs */}
      {mode === 'direct' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                Supabase Project URL
              </label>
              <input
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder={USER_PROJECT_URL_HINT}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-xs font-mono font-bold text-gray-950 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
                Supabase Anon / Publishable Key (Public Key Only)
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGci... o sb_publishable_..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 pr-10 text-xs font-mono font-bold text-gray-950 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-1"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Optional Supabase Auth sign-in for strict `TO authenticated` RLS */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-3">
            <button
              type="button"
              onClick={() => setShowAuthBox((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-200 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Supabase Auth Session (Optional — required when using strict schema.sql RLS)
                {authSessionEmail && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    Signed in: {authSessionEmail}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showAuthBox ? 'rotate-180' : ''}`}
              />
            </button>

            {showAuthBox && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3">
                {authSessionEmail ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Authenticated Supabase session active for <strong>{authSessionEmail}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={handleSupabaseAuthSignOut}
                      disabled={authLoading}
                      className="px-4 py-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSupabaseAuthSignIn}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                  >
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="Supabase Auth email"
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white outline-none"
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Supabase Auth password"
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white outline-none"
                    />
                    <button
                      type="submit"
                      disabled={authLoading || !authEmail || !authPassword}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {authLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogIn className="w-3.5 h-3.5" />
                      )}
                      Sign In Supabase Auth
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1">
          <p className="font-black">Server Proxy Mode Active (/api/supabase-sync)</p>
          <p className="font-medium">
            Uses <code className="font-mono">SUPABASE_URL</code>,{' '}
            <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>, and{' '}
            <code className="font-mono">POS_API_SECRET</code> on the backend server so browser clients never hold a service key and RLS writes work seamlessly.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleTestSupabase}
          disabled={testing || activating}
          className="px-5 py-3.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Test Supabase Connection
        </button>

        <button
          type="button"
          onClick={handleActivateSupabase}
          disabled={activating || testing}
          className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          {activating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Connect &amp; Switch to Supabase
        </button>

        <button
          type="button"
          onClick={handlePushAllToSupabase}
          disabled={pushingAll || pullingAll}
          className="px-4 py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          title="Upload all local IndexedDB records (14 tables) to Supabase"
        >
          {pushingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4 text-emerald-600" />
          )}
          Push Local → Supabase
        </button>

        <button
          type="button"
          onClick={handlePullFromSupabase}
          disabled={pullingAll || pushingAll}
          className="px-4 py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          title="Download and merge rows from Supabase into local IndexedDB"
        >
          {pullingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <DownloadCloud className="w-4 h-4 text-blue-600" />
          )}
          Pull Supabase → Local
        </button>
      </div>

      {/* Feedback Banners */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-start gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{actionMessage.text}</span>
        </div>
      )}

      {testResult && (
        <div
          className={`p-5 rounded-2xl border text-xs space-y-3 ${
            testResult.success
              ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
              : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-black uppercase tracking-wider">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                {testResult.success
                  ? 'Supabase Connection & Write Check Passed'
                  : 'Supabase Diagnostic Result'}
              </span>
            </div>
            {testResult.latencyMs !== undefined && (
              <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/80">
                {testResult.latencyMs}ms • {testResult.mode.toUpperCase()}
              </span>
            )}
          </div>

          <p className="font-semibold leading-relaxed">{testResult.message}</p>

          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-white/70 dark:bg-gray-900/70">
              Reachable: {testResult.reachable ? 'Yes' : 'No'}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/70 dark:bg-gray-900/70">
              Schema Tables: {testResult.tablesFound ? 'Found (14)' : 'Missing'}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/70 dark:bg-gray-900/70">
              RLS Read: {testResult.rlsReadable ? 'Allowed' : 'Blocked'}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/70 dark:bg-gray-900/70">
              RLS Write: {testResult.rlsWritable ? 'Allowed' : 'Blocked'}
            </span>
          </div>

          {testResult.tableCounts && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-black/10 dark:border-white/10">
              {Object.entries(testResult.tableCounts).map(([tbl, count]) => (
                <div
                  key={tbl}
                  className="px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-gray-900/70 flex items-center justify-between gap-1 text-[10px] font-mono"
                >
                  <span className="truncate text-gray-600 dark:text-gray-300">{tbl}</span>
                  <strong className="text-gray-900 dark:text-white">
                    {count < 0 ? 'ERR' : count}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
