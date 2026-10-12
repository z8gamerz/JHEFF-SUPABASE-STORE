'use client';

import { useBranches } from '@/lib/hooks/use-branches';
import { useAuth } from '@/lib/contexts/auth-context';
import { MapPin, ChevronDown, Plus, Settings, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BranchModal } from '../branches/branch-modal';

interface BranchSelectorProps {
  onManageBranches?: () => void;
}

export function BranchSelector({ onManageBranches }: BranchSelectorProps) {
  const { branches, currentBranch, switchBranch } = useBranches();
  const { isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingBranch, setIsAddingBranch] = useState(false);

  // If user has no branches authorized, display no-access indicator
  if (branches.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3.5 py-2 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold">
        <Lock className="w-3.5 h-3.5" />
        <span>No Branch Assigned</span>
      </div>
    );
  }

  // If non-admin and only assigned to 1 branch, lock to that single branch without dropdown switching
  const isLockedToSingleBranch = !isAdmin && branches.length === 1;

  if (isLockedToSingleBranch) {
    return (
      <div 
        className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2.5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs"
        title="Your assigned store branch"
      >
        <div className="bg-orange-100 dark:bg-orange-950/60 p-1.5 rounded-lg text-orange-600 dark:text-orange-400">
          <MapPin className="w-4 h-4" />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest leading-none">Branch</p>
            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-md">Assigned</span>
          </div>
          <p className="text-sm font-black text-gray-900 dark:text-white leading-none mt-1">{currentBranch?.name || branches[0].name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2.5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all group cursor-pointer"
      >
        <div className="bg-orange-100 dark:bg-orange-950/60 p-1.5 rounded-lg text-orange-600 dark:text-orange-400 group-hover:bg-orange-600 group-hover:text-white transition-colors">
          <MapPin className="w-4 h-4" />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-400 uppercase tracking-widest leading-none">
              {isAdmin ? 'Branch (Admin)' : 'Assigned Branch'}
            </p>
            {isAdmin && <ShieldCheck className="w-3 h-3 text-orange-600 dark:text-orange-400" />}
          </div>
          <p className="text-sm font-black text-gray-900 dark:text-white leading-none mt-1">
            {currentBranch?.name || 'Select Branch'}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    {isAdmin ? 'Admin Overseer' : 'Your Assigned Branches'}
                  </p>
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    {isAdmin ? `All Locations (${branches.length})` : `${branches.length} Assigned`}
                  </p>
                </div>
                {isAdmin && onManageBranches && (
                  <button 
                    onClick={() => {
                      onManageBranches();
                      setIsOpen(false);
                    }}
                    title="Manage Branches"
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-all cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {branches.map((branch) => {
                  const isCurrent = currentBranch?.id === branch.id;
                  return (
                    <button
                      key={branch.id}
                      onClick={() => {
                        switchBranch(branch.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                        isCurrent 
                          ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 font-black' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <MapPin className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`} />
                        <span className="font-bold text-sm truncate">{branch.name}</span>
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    setIsAddingBranch(true);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3.5 bg-gray-950 dark:bg-gray-800 text-white hover:bg-orange-600 dark:hover:bg-orange-600 transition-colors font-black text-xs uppercase tracking-widest cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add New Branch
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingBranch && (
          <BranchModal onClose={() => setIsAddingBranch(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
