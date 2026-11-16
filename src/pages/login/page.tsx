'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/lib/contexts/auth-context';
import { motion } from 'motion/react';
import { Store, Mail, Lock, Loader2, ArrowRight, ShieldAlert, Clock, AlertTriangle, ExternalLink, Copy, Check, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { getConfiguredRtdbUrl, getFirebaseAuthToken, getFirebaseConsoleUrl } from '@/lib/db/firebase-config';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [showFirebaseRestricted, setShowFirebaseRestricted] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const { login, rateLimitStatus, refreshRateLimitStatus, resetRateLimit } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const handleTestFirebase = async () => {
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const BASE_URL = getConfiguredRtdbUrl();
      if (!BASE_URL) {
        setTestResult('Firebase Realtime Database URL is not configured. Please set VITE_FIREBASE_RTDB_URL or configure it in Store Settings.');
        setIsTestingConnection(false);
        return;
      }
      const token = getFirebaseAuthToken();
      const authQuery = token ? `?auth=${encodeURIComponent(token)}` : '';
      const res = await fetch(`${BASE_URL}/users.json${authQuery}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('firebase_sync_error');
        }
        setShowFirebaseRestricted(false);
        setError('');
        setTestResult('Success! Bukas na ang Firebase. Pwede ka nang mag-login!');
      } else {
        setTestResult(`Naka-lock pa rin ang Firebase (HTTP ${res.status}). I-check ang Tab 1 at pindutin ang Publish.`);
      }
    } catch {
      setTestResult('Hindi makakonekta sa Firebase. I-check ang internet connection.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Check if Firebase returned 401 Unauthorized
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShowFirebaseRestricted(localStorage.getItem('firebase_sync_error') === 'Unauthorized');
    }
  }, []);

  // Synchronize countdown with rate limit status
  useEffect(() => {
    if (rateLimitStatus.lockoutSeconds > 0) {
      setCountdown(rateLimitStatus.lockoutSeconds);
    } else {
      setCountdown(0);
    }
  }, [rateLimitStatus]);

  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          refreshRateLimitStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown, refreshRateLimitStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countdown > 0) return;
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push(callbackUrl);
    } catch (err: any) {
      const msg = err.message || 'Failed to login';
      setError(msg);
      if (msg.includes('Firebase') || msg.includes('Permission Denied')) {
        setShowFirebaseRestricted(true);
      }
      refreshRateLimitStatus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyRules = () => {
    navigator.clipboard.writeText(`{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}`);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2000);
  };

  const isLocked = countdown > 0 || !rateLimitStatus.allowed;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 font-sans relative transition-colors">
      {/* Top right Theme Toggle */}
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle variant="header" showLabel={true} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-600 rounded-[2rem] text-white shadow-2xl shadow-orange-200 dark:shadow-none mb-6">
            <Store className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">Welcome Back</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Login to your POS account</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-[3rem] p-8 md:p-12 shadow-2xl border border-gray-100 dark:border-gray-800 transition-colors">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Firebase Database Restricted Notice */}
            {showFirebaseRestricted && (
              <div className="bg-rose-50 dark:bg-rose-950/60 text-rose-950 dark:text-rose-200 p-5 rounded-2xl text-xs border border-rose-200 dark:border-rose-900 space-y-3">
                <div className="flex items-start gap-2.5 font-black text-rose-900 dark:text-rose-100">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="uppercase tracking-wider">Firebase Permission Denied</p>
                    <p className="font-medium text-[11px] text-rose-800 dark:text-rose-300 mt-1 leading-relaxed">
                      Naka-lock mode ang Realtime Database rules sa Firebase Console kaya hindi ma-download ang iyong account sa bagong device na ito.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-gray-950 text-emerald-400 font-mono text-[11px] rounded-xl flex items-center justify-between">
                  <span>{`{ "rules": { ".read": true, ".write": true } }`}</span>
                  <button
                    type="button"
                    onClick={handleCopyRules}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-[10px] font-bold cursor-pointer"
                  >
                    {copiedRules ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rose-200 dark:border-rose-900/60">
                  <a
                    href={getFirebaseConsoleUrl('rules')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rose-700 dark:text-rose-400 underline font-black inline-flex items-center gap-1 hover:text-rose-900 text-[11px]"
                  >
                    Buksan ang Firebase Rules Console <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={handleTestFirebase}
                    disabled={isTestingConnection}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isTestingConnection ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Subukan Ulit
                  </button>
                </div>

                {testResult && (
                  <p className="text-[11px] font-black text-rose-900 dark:text-rose-200 pt-1">
                    {testResult}
                  </p>
                )}
              </div>
            )}

            {/* Lockout Warning */}
            {isLocked && (
              <div className="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 p-4 rounded-2xl text-xs font-bold border border-amber-200 dark:border-amber-800 space-y-3">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 animate-spin" />
                  <div>
                    <p className="font-black uppercase tracking-wider">Account Security Lockout</p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                      Too many failed attempts. Please wait <span className="font-black text-amber-900 dark:text-amber-100">{countdown}s</span> before retrying.
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-amber-200 dark:border-amber-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">
                    Admin Device Reset:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      resetRateLimit();
                      setCountdown(0);
                      setError('');
                    }}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer shadow-xs"
                  >
                    Unlock Device
                  </button>
                </div>
              </div>
            )}

            {error && !isLocked && !showFirebaseRestricted && (
              <div className="bg-red-50 dark:bg-rose-950/50 text-red-600 dark:text-rose-400 p-4 rounded-2xl text-xs font-bold border border-red-100 dark:border-rose-900/50 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 w-5 h-5" />
                <input
                  type="email"
                  required
                  disabled={isLocked || isSubmitting}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-[2rem] pl-14 pr-8 py-5 font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition-all outline-none text-lg disabled:opacity-50"
                  placeholder="name@store.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-4">Password</label>
              <div className="relative">
                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 w-5 h-5" />
                <input
                  type="password"
                  required
                  disabled={isLocked || isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-[2rem] pl-14 pr-8 py-5 font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition-all outline-none text-lg disabled:opacity-50"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLocked}
              className="w-full bg-gray-900 hover:bg-black dark:bg-orange-600 dark:hover:bg-orange-700 text-white font-black py-6 rounded-[2rem] flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 uppercase tracking-widest text-sm mt-8 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isLocked ? (
                <span>Locked ({countdown}s)</span>
              ) : (
                <>
                  Login to POS <ArrowRight className="w-6 h-6" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 text-center">
            <p className="text-gray-400 dark:text-gray-500 font-medium text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-orange-600 dark:text-orange-400 font-black uppercase tracking-widest text-xs hover:underline">
                Sign up here
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-orange-600 animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
