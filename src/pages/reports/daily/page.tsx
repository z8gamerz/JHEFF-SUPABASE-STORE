'use client';

import { useReports } from '@/lib/hooks/use-reports';
import { useAuth } from '@/lib/contexts/auth-context';
import { useStore } from '@/lib/hooks/use-store';
import { Header } from '@/components/layout/header';
import { 
  Loader2, 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown,
  ShoppingBag, 
  Wallet, 
  Percent,
  Calendar,
  LayoutDashboard
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';

import { useBranches } from '@/lib/hooks/use-branches';

export default function DailySummaryPage() {
  const { currentBranchId, currentBranch, loading: loadingBranches, isBranchAuthorized } = useBranches();
  const { loading, getDailySummary } = useReports(currentBranchId || undefined);
  const { isAdmin, isCashier } = useAuth();
  const { store } = useStore();

  const summary = getDailySummary();

  if (loading || loadingBranches) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-12 h-12 animate-spin text-orange-600" />
      </div>
    );
  }

  const isAuthorized = isAdmin || (!!currentBranchId && isBranchAuthorized(currentBranchId));

  if (!isAuthorized || !currentBranchId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col font-sans transition-colors">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-[3rem] p-12 text-center border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none">
            <div className="w-24 h-24 bg-red-50 dark:bg-rose-950/40 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 text-red-600 dark:text-red-400">
              <LayoutDashboard className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase mb-4">No Branch Access</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium leading-relaxed mb-8">
              You are not authorized to view the daily summary for this branch. Please contact your administrator.
            </p>
            <Link 
              href="/"
              className="inline-flex items-center gap-3 px-8 py-4 bg-gray-900 dark:bg-gray-800 hover:bg-black dark:hover:bg-gray-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Sales',
      value: `₱${summary.totalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: 'bg-orange-600',
      bg: 'bg-white dark:bg-gray-900 border-2 border-orange-300 dark:border-orange-800/80 shadow-sm',
      textColor: 'text-orange-950 dark:text-orange-200',
    },
    {
      title: 'Total Profit',
      value: `₱${summary.totalProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: LayoutDashboard,
      color: 'bg-emerald-600',
      bg: 'bg-white dark:bg-gray-900 border-2 border-emerald-300 dark:border-emerald-800/80 shadow-sm',
      textColor: 'text-emerald-950 dark:text-emerald-200',
    },
    {
      title: 'Total Expenses',
      value: `₱${(summary.totalExpenses || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: TrendingDown,
      color: 'bg-red-600',
      bg: 'bg-white dark:bg-gray-900 border-2 border-rose-300 dark:border-rose-800/80 shadow-sm',
      textColor: 'text-rose-950 dark:text-rose-200',
    },
    ...(store?.taxType === 'VAT' ? [
      {
        title: 'VAT Collected',
        value: `₱${summary.totalVatCollected.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        icon: Percent,
        color: 'bg-rose-600',
        bg: 'bg-white dark:bg-gray-900 border-2 border-rose-300 dark:border-rose-800/80 shadow-sm',
        textColor: 'text-rose-950 dark:text-rose-200',
      },
      {
        title: 'VATable Sales',
        value: `₱${summary.totalVatableSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        icon: Percent,
        color: 'bg-amber-600',
        bg: 'bg-white dark:bg-gray-900 border-2 border-amber-300 dark:border-amber-800/80 shadow-sm',
        textColor: 'text-amber-950 dark:text-amber-200',
      }
    ] : []),
    {
      title: 'Total Tickets',
      value: summary.totalTickets.toString(),
      icon: ShoppingBag,
      color: 'bg-blue-600',
      bg: 'bg-white dark:bg-gray-900 border-2 border-blue-300 dark:border-blue-800/80 shadow-sm',
      textColor: 'text-blue-950 dark:text-blue-200',
    },
    {
      title: 'E-Wallet Transactions',
      value: summary.ewalletCount.toString(),
      icon: Wallet,
      color: 'bg-indigo-600',
      bg: 'bg-white dark:bg-gray-900 border-2 border-indigo-300 dark:border-indigo-800/80 shadow-sm',
      textColor: 'text-indigo-950 dark:text-indigo-200',
    },
    {
      title: 'Total Fees Earned',
      value: `₱${summary.totalFees.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: Percent,
      color: 'bg-purple-600',
      bg: 'bg-white dark:bg-gray-900 border-2 border-purple-300 dark:border-purple-800/80 shadow-sm',
      textColor: 'text-purple-950 dark:text-purple-200',
    },
    ...(summary.orRange ? [
      {
        title: 'OR Range',
        value: `${summary.orRange.start} - ${summary.orRange.end.split('-')[1]}`,
        icon: ShoppingBag,
        color: 'bg-slate-700',
        bg: 'bg-white dark:bg-gray-900 border-2 border-slate-300 dark:border-slate-700 shadow-sm',
        textColor: 'text-slate-950 dark:text-slate-200',
      }
    ] : []),
  ];

  const getAutoFitSize = (val: string) => {
    const len = val.length;
    if (len > 18) return 'text-xl sm:text-2xl md:text-3xl';
    if (len > 13) return 'text-2xl sm:text-3xl md:text-4xl';
    if (len > 8) return 'text-3xl sm:text-4xl md:text-5xl';
    return 'text-4xl sm:text-5xl';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col font-sans transition-colors">
      <Header />
      
      <div className="flex-1 p-4 sm:p-6 md:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 sm:gap-6 mb-8 sm:mb-12">
            <Link 
              href="/"
              className="p-3.5 sm:p-4 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl sm:rounded-[1.5rem] transition-all text-gray-800 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white border-2 border-gray-200 dark:border-gray-800 shadow-xs shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </Link>
            <div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-950 dark:text-white tracking-tighter leading-tight">
                Daily Summary
              </h2>
              <p className="text-sm sm:text-base text-gray-800 dark:text-gray-200 font-bold flex items-center gap-2 mt-1">
                <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-400 stroke-[2.5]" />
                {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
            {cards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`${card.bg} p-6 sm:p-8 md:p-10 rounded-3xl sm:rounded-[2.5rem] hover:shadow-xl transition-all flex flex-col justify-between h-full group min-w-0 overflow-hidden`}
              >
                <div className={`${card.color} w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-6 sm:mb-8 text-white shadow-xl group-hover:scale-105 transition-transform shrink-0`}>
                  <card.icon className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-gray-900 dark:text-gray-100 font-black text-xs sm:text-sm uppercase tracking-wider mb-2">
                    {card.title}
                  </p>
                  <p 
                    title={card.value}
                    className={`${card.textColor} ${getAutoFitSize(card.value)} font-black tracking-tight leading-tight truncate min-w-0 max-w-full`}
                  >
                    {card.value}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 sm:mt-12 p-6 sm:p-8 bg-gray-950 dark:bg-gray-900 border-2 border-gray-800 rounded-3xl sm:rounded-[2.5rem] text-white text-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600 rounded-full -mr-32 -mt-32 opacity-20 blur-3xl" />
             <p className="text-orange-400 font-black text-xs uppercase tracking-widest mb-3 relative z-10">End of Day Summary</p>
             <h3 className="text-xl sm:text-2xl font-black mb-6 sm:mb-8 relative z-10 tracking-tight">Great job today! Your store is performing well.</h3>
             <Link 
               href="/reports"
               className="inline-flex items-center gap-2.5 bg-white text-gray-950 font-black px-8 sm:px-12 py-4 sm:py-5 rounded-2xl hover:bg-gray-100 transition-all active:scale-95 uppercase tracking-wider text-xs sm:text-sm relative z-10 cursor-pointer shadow-lg"
             >
               View Full Reports Dashboard
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
