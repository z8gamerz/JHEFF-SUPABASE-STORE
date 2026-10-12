'use client';

import { TrendingUp, ShoppingBag, Users, CreditCard, Wallet, ArrowUpRight, ArrowDownLeft, Percent } from 'lucide-react';
import { motion } from 'motion/react';

interface SummaryCardsProps {
  totalSales: number;
  totalProfit: number;
  totalExpenses?: number;
  totalTransactions: number;
  totalUtang: number;
  totalCashIn?: number;
  totalCashOut?: number;
  totalEwalletFees?: number;
  totalVatCollected?: number;
  totalVatableSales?: number;
  taxType?: 'VAT' | 'NON-VAT';
  orRange?: { start: string; end: string } | null;
}

export function SummaryCards({ 
  totalSales, 
  totalProfit,
  totalExpenses = 0,
  totalTransactions, 
  totalUtang,
  totalCashIn = 0,
  totalCashOut = 0,
  totalEwalletFees = 0,
  totalVatCollected = 0,
  totalVatableSales = 0,
  taxType = 'NON-VAT',
  orRange = null
}: SummaryCardsProps) {
  const cards = [
    {
      title: 'Total Sales',
      value: `₱${totalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: 'bg-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/30',
      textColor: 'text-orange-950 dark:text-orange-200',
    },
    {
      title: 'Total Profit',
      value: `₱${totalProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: ArrowUpRight,
      color: 'bg-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30',
      textColor: 'text-emerald-950 dark:text-emerald-200',
    },
    {
      title: 'Total Expenses',
      value: `₱${totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: ArrowDownLeft,
      color: 'bg-red-600',
      bg: 'bg-red-50 dark:bg-rose-950/30 border border-red-100 dark:border-rose-900/30',
      textColor: 'text-red-950 dark:text-rose-200',
    },
    {
      title: 'Transactions',
      value: totalTransactions.toString(),
      icon: ShoppingBag,
      color: 'bg-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30',
      textColor: 'text-blue-950 dark:text-blue-200',
    },
    {
      title: 'Customer Credits',
      value: `₱${totalUtang.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: Users,
      color: 'bg-red-600',
      bg: 'bg-red-50 dark:bg-rose-950/30 border border-red-100 dark:border-rose-900/30',
      textColor: 'text-red-950 dark:text-rose-200',
    },
    {
      title: 'E-Wallet Fees',
      value: `₱${totalEwalletFees.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: Wallet,
      color: 'bg-green-600',
      bg: 'bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/30',
      textColor: 'text-green-950 dark:text-green-200',
    },
    ...(taxType === 'VAT' ? [
      {
        title: 'VAT Collected',
        value: `₱${totalVatCollected.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        icon: Percent,
        color: 'bg-rose-600',
        bg: 'bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/30',
        textColor: 'text-rose-950 dark:text-rose-200',
      },
      {
        title: 'VATable Sales',
        value: `₱${totalVatableSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        icon: Percent,
        color: 'bg-amber-600',
        bg: 'bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30',
        textColor: 'text-amber-950 dark:text-amber-200',
      }
    ] : []),
    ...(orRange ? [
      {
        title: 'OR Range',
        value: `${orRange.start} - ${orRange.end.split('-')[1]}`,
        icon: ShoppingBag,
        color: 'bg-slate-700',
        bg: 'bg-white dark:bg-gray-900 border-2 border-slate-300 dark:border-slate-700 shadow-sm',
        textColor: 'text-slate-950 dark:text-slate-200',
      }
    ] : []),
  ];

  const getAutoFitSize = (val: string) => {
    const len = val.length;
    if (len > 16) return 'text-base sm:text-lg';
    if (len > 12) return 'text-lg sm:text-xl';
    return 'text-xl sm:text-2xl';
  };

  const ewalletCards = [
    {
      title: 'Cash In Volume',
      value: `₱${totalCashIn.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: ArrowUpRight,
      color: 'bg-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30',
      textColor: 'text-emerald-950 dark:text-emerald-200',
    },
    {
      title: 'Cash Out Volume',
      value: `₱${totalCashOut.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      icon: ArrowDownLeft,
      color: 'bg-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/30',
      textColor: 'text-amber-950 dark:text-amber-200',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 sm:gap-6">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`${card.bg} p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] hover:shadow-xl transition-all h-full flex flex-col justify-between min-w-0 overflow-hidden`}
          >
            <div className={`${card.color} w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg shrink-0`}>
              <card.icon className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div className="min-w-0 w-full">
              <p className="text-gray-950 dark:text-gray-100 font-black text-xs uppercase tracking-wider mb-1">
                {card.title}
              </p>
              <p 
                title={card.value}
                className={`${card.textColor} font-black ${getAutoFitSize(card.value)} tracking-tight truncate min-w-0 max-w-full`}
              >
                {card.value}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {ewalletCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (index + 4) * 0.05 }}
            className={`${card.bg} p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] hover:shadow-xl transition-all h-full flex flex-col justify-between min-w-0 overflow-hidden`}
          >
            <div className={`${card.color} w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg shrink-0`}>
              <card.icon className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
            <div className="min-w-0 w-full">
              <p className="text-gray-950 dark:text-gray-100 font-black text-xs uppercase tracking-wider mb-1">
                {card.title}
              </p>
              <p 
                title={card.value}
                className={`${card.textColor} font-black ${getAutoFitSize(card.value)} tracking-tight truncate min-w-0 max-w-full`}
              >
                {card.value}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
