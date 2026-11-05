'use client';

import { useStore } from '@/lib/hooks/use-store';
import { useAuth } from '@/lib/contexts/auth-context';
import { Store, Clock, UserCircle, ChevronDown, LogOut, RefreshCw, CloudLightning } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BranchSelector } from './branch-selector';
import { BranchManagement } from '../branches/branch-management';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { pullSync, processQueue } from '@/lib/db/sync-queue';
import { realtimeSync, RealtimeStatus } from '@/lib/db/realtime-sync';
import { PWAInstallButton } from '@/components/pwa/pwa-install-button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function Header({ ticketNumber }: { ticketNumber?: string }) {
  const { store } = useStore();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [isManagingBranches, setIsManagingBranches] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [hasSyncError, setHasSyncError] = useState(false);
  const [streamStatus, setStreamStatus] = useState<RealtimeStatus>(() => realtimeSync.getStatus());

  useEffect(() => {
    const unsub = realtimeSync.subscribeStatus((st) => {
      setStreamStatus(st);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasSyncError(localStorage.getItem('firebase_sync_error') === 'Unauthorized');
    }
  }, [isSyncing, streamStatus]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncSuccess(false);
    try {
      await pullSync();
      await processQueue();
      realtimeSync.start();
      setSyncSuccess(true);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('firebase_sync_error');
        setHasSyncError(false);
      }
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (error) {
      console.error('Manual sync failed:', error);
      if (typeof window !== 'undefined') {
        setHasSyncError(localStorage.getItem('firebase_sync_error') === 'Unauthorized');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header className="border-b bg-white/80 dark:bg-gray-900/90 dark:border-gray-800 backdrop-blur-md px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-xs transition-colors">
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-4"
      >
        <div className="bg-orange-600 p-3 rounded-2xl shadow-lg shadow-orange-200 dark:shadow-none">
          <Store className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-black text-xl md:text-2xl tracking-tight text-gray-900 dark:text-white leading-tight">
            {store?.name || 'Sari-Sari POS'}
          </h1>
          <div className="flex items-center gap-3 mt-0.5">
            <div className="flex items-center gap-1 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              <Clock className="w-3 h-3" />
              {new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {ticketNumber && (
              <div className="flex items-center gap-1 text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                <span className="w-1 h-1 bg-orange-600 dark:bg-orange-400 rounded-full" />
                Ticket: {ticketNumber}
              </div>
            )}
          </div>
        </div>
      </motion.div>
      
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Dark Theme Toggle */}
        <ThemeToggle variant="header" showLabel={true} />

        {/* PWA Install Button */}
        <PWAInstallButton variant="header" />

        {/* Firebase Live Webhook / Auto-Push Sync Button */}
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-2xl border transition-all cursor-pointer ${
            isSyncing 
              ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 animate-pulse'
              : syncSuccess
              ? 'bg-green-50 dark:bg-emerald-950/40 border-green-200 dark:border-emerald-800 text-green-600 dark:text-emerald-400'
              : hasSyncError
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 animate-pulse'
              : streamStatus === 'connected'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 shadow-xs'
              : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 shadow-xs'
          }`}
          title={
            hasSyncError 
              ? "Firebase rules are blocking sync. Click to retry." 
              : streamStatus === 'connected'
              ? "Live Auto-Push Stream Active: Updates sync to/from all logged-in devices in real-time."
              : "Click to force refresh data with Firebase Realtime Database"
          }
        >
          {hasSyncError && !isSyncing && !syncSuccess ? (
            <CloudLightning className="w-3.5 h-3.5 text-rose-500" />
          ) : isSyncing ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : streamStatus === 'connected' ? (
            <span className="relative flex h-2 w-2 mr-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span className="hidden md:inline">
            {isSyncing ? 'Syncing...' : syncSuccess ? 'Synced' : hasSyncError ? 'Auth Error' : streamStatus === 'connected' ? 'Live Auto-Push' : 'Sync'}
          </span>
        </button>

        {/* User Menu */}
        <div className="relative">
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl border border-gray-100 dark:border-gray-700 transition-all group cursor-pointer"
          >
            <div className={`p-1.5 rounded-lg ${user?.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300'}`}>
              <UserCircle className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block min-w-0">
              <p className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-tight">{user?.role}</p>
              <p className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight truncate max-w-[120px] mt-0.5">{user?.email}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsUserMenuOpen(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-2 z-50 overflow-hidden text-gray-900 dark:text-gray-100"
                >
                  <div className="p-3 border-b border-gray-50 dark:border-gray-800 mb-1">
                    <p className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Logged in as</p>
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{user?.email}</p>
                  </div>
                  {isAdmin && (
                    <Link
                      href="/admin/users"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                    >
                      <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                        <UserCircle className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm">Manage Users</span>
                    </Link>
                  )}

                  <div className="border-t border-gray-100 dark:border-gray-800 my-1 pt-1">
                    <ThemeToggle variant="dropdown-item" />
                  </div>

                  <button
                    onClick={() => {
                      logout();
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
                  >
                    <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/50">
                      <LogOut className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm">Logout</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <BranchSelector onManageBranches={() => setIsManagingBranches(true)} />
        
        <div className="hidden lg:flex flex-col text-right">
          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-0.5">
            Current Date
          </p>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {isManagingBranches && (
          <BranchManagement onClose={() => setIsManagingBranches(false)} />
        )}
      </AnimatePresence>
    </header>
  );
}
