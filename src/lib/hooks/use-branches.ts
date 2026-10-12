'use client';

import { useAuth } from '@/lib/contexts/auth-context';
import { useStore } from '@/lib/hooks/use-store';

export function useBranches() {
  const { user, isAdmin } = useAuth();
  const { 
    branches, 
    allBranches, 
    currentBranchId, 
    currentBranch, 
    loading, 
    addBranch, 
    updateBranch,
    deleteBranch,
    switchBranch,
    isBranchAuthorized,
  } = useStore();

  return {
    branches, // Authorized branches for the current user
    allBranches, // All branches in store (for Admin oversight)
    currentBranchId,
    currentBranch,
    isAdmin,
    user,
    loading,
    addBranch,
    updateBranch,
    deleteBranch,
    selectBranch: switchBranch,
    switchBranch,
    isBranchAuthorized,
    refresh: () => {}, // Handled by StoreProvider
  };
}
