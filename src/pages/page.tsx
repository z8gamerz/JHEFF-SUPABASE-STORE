'use client';

import { useStore } from '@/lib/hooks/use-store';
import { useAuth } from '@/lib/contexts/auth-context';
import { StoreSetup } from '@/components/inventory/store-setup';
import { Header } from '@/components/layout/header';
import { Loader2, Package, ShoppingCart, Users, ArrowRight, BarChart3, Truck, LayoutDashboard, Settings, CloudLightning, Copy, Check, ExternalLink, AlertTriangle, X, TrendingDown, FolderTree } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { PWAInstallButton } from '@/components/pwa/pwa-install-button';

interface BaseMenuItem {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  shadow: string;
  bg: string;
  textColor: string;
  accentColor: string;
  adminOnly?: boolean;
}

interface LinkMenuItem extends BaseMenuItem {
  href: string;
  onClick?: never;
}

interface ActionMenuItem extends BaseMenuItem {
  href?: never;
  onClick: () => void;
}

type MenuItem = LinkMenuItem | ActionMenuItem;

export default function Home() {
  return (
    <AuthGuard>
      <HomeDashboard />
    </AuthGuard>
  );
}

function HomeDashboard() {
  const { store, loading } = useStore();
  const { isCashier } = useAuth();
  const [showSyncError, setShowSyncError] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShowSyncError(localStorage.getItem('firebase_sync_error') === 'Unauthorized');
    }
  }, []);

  const handleCopyRules = () => {
    navigator.clipboard.writeText(`{\n  "rules": {\n    ".read": "true",\n    ".write": "true"\n  }\n}`);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 transition-colors">
        <Loader2 className="w-12 h-12 animate-spin text-orange-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest text-xs">
          Loading Store...
        </p>
      </div>
    );
  }

  if (!store) {
    return <StoreSetup />;
  }

  const menuItems: MenuItem[] = [
    {
      title: 'POS Checkout',
      description: 'Start a new transaction',
      href: '/pos',
      icon: ShoppingCart,
      color: 'bg-blue-600',
      shadow: 'shadow-blue-100 dark:shadow-none',
      bg: 'bg-blue-50 dark:bg-blue-950/30 dark:border dark:border-blue-900/30',
      textColor: 'text-blue-900 dark:text-blue-200',
      accentColor: 'text-blue-600/70 dark:text-blue-400/80'
    },
    {
      title: 'Daily Summary',
      description: 'Today\'s performance',
      href: '/reports/daily',
      icon: LayoutDashboard,
      color: 'bg-rose-600',
      shadow: 'shadow-rose-100 dark:shadow-none',
      bg: 'bg-rose-50 dark:bg-rose-950/30 dark:border dark:border-rose-900/30',
      textColor: 'text-rose-900 dark:text-rose-200',
      accentColor: 'text-rose-600/70 dark:text-rose-400/80'
    },
    {
      title: 'Inventory',
      description: 'Manage products & stock',
      href: '/products',
      icon: Package,
      color: 'bg-orange-600',
      shadow: 'shadow-orange-100 dark:shadow-none',
      bg: 'bg-orange-50 dark:bg-orange-950/30 dark:border dark:border-orange-900/30',
      textColor: 'text-orange-900 dark:text-orange-200',
      accentColor: 'text-orange-600/70 dark:text-orange-400/80'
    },
    {
      title: 'Categories',
      description: 'Group & view items by category',
      href: '/categories',
      icon: FolderTree,
      color: 'bg-emerald-600',
      shadow: 'shadow-emerald-100 dark:shadow-none',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30 dark:border dark:border-emerald-900/30',
      textColor: 'text-emerald-900 dark:text-emerald-200',
      accentColor: 'text-emerald-600/70 dark:text-emerald-400/80'
    },
    {
      title: 'Restocking',
      description: 'Suppliers & stock-in',
      href: '/restocking',
      icon: Truck,
      color: 'bg-indigo-600',
      shadow: 'shadow-indigo-100 dark:shadow-none',
      bg: 'bg-indigo-50 dark:bg-indigo-950/30 dark:border dark:border-indigo-900/30',
      textColor: 'text-indigo-900 dark:text-indigo-200',
      accentColor: 'text-indigo-600/70 dark:text-indigo-400/80',
      adminOnly: true
    },
    {
      title: 'Expenses',
      description: 'Track operational costs & bills',
      href: '/expenses',
      icon: TrendingDown,
      color: 'bg-red-600',
      shadow: 'shadow-red-100 dark:shadow-none',
      bg: 'bg-red-50 dark:bg-red-950/30 dark:border dark:border-red-900/30',
      textColor: 'text-red-900 dark:text-red-200',
      accentColor: 'text-red-600/70 dark:text-red-400/80'
    },
    {
      title: 'Credit & Receivables',
      description: 'Customer credit & payment ledger',
      href: '/utang',
      icon: Users,
      color: 'bg-green-600',
      shadow: 'shadow-green-100 dark:shadow-none',
      bg: 'bg-green-50 dark:bg-green-950/30 dark:border dark:border-green-900/30',
      textColor: 'text-green-900 dark:text-green-200',
      accentColor: 'text-green-600/70 dark:text-green-400/80',
      adminOnly: true
    },
    {
      title: 'Reports',
      description: 'Analyze sales trends',
      href: '/reports',
      icon: BarChart3,
      color: 'bg-purple-600',
      shadow: 'shadow-purple-100 dark:shadow-none',
      bg: 'bg-purple-50 dark:bg-purple-950/30 dark:border dark:border-purple-900/30',
      textColor: 'text-purple-900 dark:text-purple-200',
      accentColor: 'text-purple-600/70 dark:text-purple-400/80',
      adminOnly: true
    },
    {
      title: 'Store Settings',
      description: 'Tax & store info',
      href: '/settings',
      icon: Settings,
      color: 'bg-gray-600',
      shadow: 'shadow-gray-100 dark:shadow-none',
      bg: 'bg-gray-50 dark:bg-gray-900/50 dark:border dark:border-gray-800',
      textColor: 'text-gray-900 dark:text-gray-200',
      accentColor: 'text-gray-600/70 dark:text-gray-400/80',
      adminOnly: true
    }
  ];

  const filteredItems = menuItems.filter(item => !item.adminOnly || !isCashier);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors flex flex-col">
      <Header />
        
      <div className="w-full flex-1 px-3 sm:px-6 md:px-8 lg:px-10 py-4 sm:py-6 flex flex-col justify-between">
        <div className="w-full">
          {/* PWA Install Banner (automatically hides if already installed) */}
          <PWAInstallButton variant="banner" className="mb-4 sm:mb-6" />

          <AnimatePresence>
            {showSyncError && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="bg-rose-50 border-2 border-rose-100 rounded-3xl p-5 md:p-8 shadow-xl overflow-hidden relative text-left mb-6"
              >
                <button 
                  onClick={() => setShowSyncError(false)}
                  className="absolute top-5 right-5 p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-100/50 rounded-full transition-all cursor-pointer"
                  title="Dismiss alert"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex gap-4 flex-col md:flex-row items-start">
                  <div className="bg-rose-100 text-rose-600 p-3.5 rounded-2xl flex-shrink-0">
                    <CloudLightning className="w-7 h-7 animate-bounce" />
                  </div>
                  <div className="flex-grow text-left">
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-rose-950 mb-2 flex items-center gap-2">
                      Firebase Database Connection Restricted
                    </h3>
                    <p className="text-xs sm:text-sm font-medium text-rose-800/90 leading-relaxed mb-4">
                      Your POS system successfully connected to the Firebase Realtime Database, but received an <strong className="font-bold">Unauthorized (401)</strong> response. This happens because default security rules in new Firebase projects are set to Locked Mode. Follow these simple steps to authorize access:
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-2">
                      <div className="space-y-3 text-xs sm:text-sm text-rose-950/90 font-medium">
                        <div className="flex gap-2.5">
                          <span className="flex items-center justify-center bg-rose-200/60 text-rose-900 font-bold w-5 h-5 rounded-full text-xs shrink-0 mt-0.5">1</span>
                          <div>
                            Open your <a href="https://console.firebase.google.com/project/database-for-inventory-88e9f/database/realtime-database/rules" target="_blank" rel="noopener noreferrer" className="text-rose-700 underline font-black inline-flex items-center gap-1 hover:text-rose-900 transition-all cursor-pointer">
                              Firebase Rules Console <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>

                        <div className="flex gap-2.5">
                          <span className="flex items-center justify-center bg-rose-200/60 text-rose-900 font-bold w-5 h-5 rounded-full text-xs shrink-0 mt-0.5">2</span>
                          <p>Copy the database rules block on the right.</p>
                        </div>

                        <div className="flex gap-2.5">
                          <span className="flex items-center justify-center bg-rose-200/60 text-rose-900 font-bold w-5 h-5 rounded-full text-xs shrink-0 mt-0.5">3</span>
                          <p>Paste them inside the rules editor and click <strong className="font-bold text-rose-900">Publish</strong>.</p>
                        </div>

                        <div className="flex gap-2.5">
                          <span className="flex items-center justify-center bg-rose-200/60 text-rose-900 font-bold w-5 h-5 rounded-full text-xs shrink-0 mt-0.5">4</span>
                          <p>Click the <strong className="font-bold text-rose-900">Sync</strong> button in the top menu to complete data sync!</p>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <button
                            onClick={handleCopyRules}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md ${
                              copiedRules 
                                ? 'bg-green-600 text-white shadow-green-100' 
                                : 'bg-gray-900 text-white hover:bg-gray-800'
                            }`}
                          >
                            {copiedRules ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedRules ? 'Copied!' : 'Copy Rules'}
                          </button>
                        </div>
                        <pre className="bg-gray-950 text-emerald-400 font-mono text-xs rounded-xl p-4 border border-rose-200/30 overflow-x-auto text-left leading-normal shadow-inner max-h-[140px]">
{`{
  "rules": {
    ".read": "true",
    ".write": "true"
  }
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full-width Responsive Hero & Action Cards */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-white dark:bg-gray-900 rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 text-center border border-gray-200 dark:border-gray-800 shadow-xl relative overflow-hidden transition-colors"
          >
            {/* Ambient decorative glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full -mr-32 -mt-32 opacity-60 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full -ml-32 -mb-32 opacity-60 blur-3xl pointer-events-none" />
  
            <div className="relative z-10 w-full">
              <div className="mb-6 sm:mb-8 text-center max-w-4xl mx-auto">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-950 dark:text-white tracking-tight uppercase leading-tight page-title-heading">
                  Mabuhay, {store.name}!
                </h2>
                <p className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mt-2 page-title-subheading">
                  Your store is open and ready for business. What would you like to do today?
                </p>
              </div>
              
              {/* Auto-resizing Fluid Grid for all devices */}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 w-full">
                {filteredItems.map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="h-full"
                  >
                    {'href' in item && item.href ? (
                      <Link 
                        href={item.href}
                        className={`group flex flex-col justify-between p-4 sm:p-6 md:p-7 ${item.bg} rounded-2xl sm:rounded-3xl border-2 border-transparent hover:border-orange-500/40 hover:shadow-2xl transition-all relative overflow-hidden h-full text-left`}
                      >
                        <div>
                          <div className={`${item.color} w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-5 text-white shadow-lg ${item.shadow} group-hover:scale-105 transition-transform`}>
                            <item.icon className="w-6 h-6 sm:w-7 sm:h-7" />
                          </div>
                          <div>
                            <p className={`${item.textColor} font-black text-base sm:text-lg md:text-xl tracking-tight mb-1 leading-tight`}>{item.title}</p>
                            <p className={`${item.accentColor} font-bold text-xs sm:text-sm line-clamp-2 leading-snug`}>{item.description}</p>
                          </div>
                        </div>
                        
                        <div className="mt-4 sm:mt-6 flex items-center gap-1.5 text-gray-950 dark:text-white font-black text-[11px] sm:text-xs uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                          Open <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </Link>
                    ) : 'onClick' in item ? (
                      <button 
                        onClick={item.onClick}
                        className={`group flex flex-col justify-between w-full p-4 sm:p-6 md:p-7 ${item.bg} rounded-2xl sm:rounded-3xl border-2 border-transparent hover:border-orange-500/40 hover:shadow-2xl transition-all relative overflow-hidden h-full text-left cursor-pointer`}
                      >
                        <div>
                          <div className={`${item.color} w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-5 text-white shadow-lg ${item.shadow} group-hover:scale-105 transition-transform`}>
                            <item.icon className="w-6 h-6 sm:w-7 sm:h-7" />
                          </div>
                          <div>
                            <p className={`${item.textColor} font-black text-base sm:text-lg md:text-xl tracking-tight mb-1 leading-tight`}>{item.title}</p>
                            <p className={`${item.accentColor} font-bold text-xs sm:text-sm line-clamp-2 leading-snug`}>{item.description}</p>
                          </div>
                        </div>
                        
                        <div className="mt-4 sm:mt-6 flex items-center gap-1.5 text-gray-950 dark:text-white font-black text-[11px] sm:text-xs uppercase tracking-wider opacity-80 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                          Open <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    ) : null}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer Quick Status Cards */}
        <div className="w-full mt-4 sm:mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-gray-950 dark:bg-gray-900 border border-gray-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 text-white flex items-center justify-between shadow-lg">
            <div>
              <p className="text-orange-400 font-black text-[10px] sm:text-xs uppercase tracking-widest mb-1">Quick Tip</p>
              <h4 className="text-base sm:text-lg font-black tracking-tight">Use &quot;Quick Add&quot; for items not in your inventory.</h4>
            </div>
            <div className="bg-white/10 p-3 sm:p-3.5 rounded-2xl shrink-0 ml-3">
              <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7 text-orange-400" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-lg flex items-center justify-between transition-colors">
            <div>
              <p className="text-emerald-700 dark:text-emerald-400 font-black text-[10px] sm:text-xs uppercase tracking-widest mb-1">Offline Ready</p>
              <h4 className="text-base sm:text-lg font-black tracking-tight text-gray-950 dark:text-white">Your data is saved locally and synced to Upstash Redis.</h4>
            </div>
            <div className="bg-green-50 dark:bg-emerald-950/50 p-3 sm:p-3.5 rounded-2xl shrink-0 ml-3">
              <Package className="w-6 h-6 sm:w-7 sm:h-7 text-green-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
