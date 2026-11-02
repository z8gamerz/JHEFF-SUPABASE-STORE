'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { StoreInfo, Product, Branch } from '@/lib/db/idb';
import { storeService } from '@/lib/services/store-service';
import { productService } from '@/lib/services/product-service';
import { branchService } from '@/lib/services/branch-service';
import { auditService } from '@/lib/services/audit-service';
import { pullSync, processQueue } from '@/lib/db/sync-queue';
import { useAuth } from '@/lib/contexts/auth-context';
import { STORES } from '@/lib/db/idb';
import { realtimeSync } from '@/lib/db/realtime-sync';

const CURRENT_BRANCH_KEY = 'sarisari_current_branch_id';

interface StoreContextType {
  store: StoreInfo | null;
  loading: boolean;
  updateStore: (name: string, address?: string, tin?: string, taxType?: 'VAT' | 'NON-VAT', vatRate?: number) => Promise<void>;
  getNextORNumber: () => Promise<string>;
  products: Product[];
  allProducts: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => Promise<Product>;
  branches: Branch[]; // Authorized branches for current user
  allBranches: Branch[]; // All branches in system for Admin oversight
  currentBranchId: string | null;
  currentBranch: Branch | undefined;
  addBranch: (branch: Omit<Branch, 'id' | 'createdAt' | 'updatedAt' | 'businessId' | 'isDeleted'>) => Promise<Branch>;
  updateBranch: (branch: Branch) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;
  switchBranch: (branchId: string) => void;
  isBranchAuthorized: (branchId: string) => boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStore = async (isBackgroundSync = false) => {
    try {
      const currentStore = await storeService.getStore();
      if (currentStore) {
        setStore(currentStore);
      }

      // Load Branches
      const businessId = currentStore?.id || 'main_config';
      let allBranchesInDb = (await branchService.getAll()).filter(b => !b.isDeleted);
      
      // Auto-clean any legacy branch named "JHEFF CONSTRUCTION BRANCH"
      const legacyBranches = allBranchesInDb.filter(b => b.name?.trim().toUpperCase() === 'JHEFF CONSTRUCTION BRANCH');
      if (legacyBranches.length > 0) {
        const nonLegacy = allBranchesInDb.filter(b => b.name?.trim().toUpperCase() !== 'JHEFF CONSTRUCTION BRANCH');
        for (const lb of legacyBranches) {
          if (nonLegacy.length > 0) {
            lb.isDeleted = true;
            lb.updatedAt = Date.now();
            await branchService.update(lb);
          } else {
            lb.name = 'Main Branch';
            lb.updatedAt = Date.now();
            await branchService.update(lb);
          }
        }
        allBranchesInDb = (await branchService.getAll()).filter(b => !b.isDeleted && b.name?.trim().toUpperCase() !== 'JHEFF CONSTRUCTION BRANCH');
      }

      let activeBranches = allBranchesInDb.filter(b => b.businessId === businessId);
      
      // If branches exist in DB but under different businessId, reuse them instead of creating duplicates
      if (activeBranches.length === 0 && allBranchesInDb.length > 0) {
        activeBranches = allBranchesInDb;
      }
      
      // ONLY create a default branch if absolutely zero branches exist in the database
      if (activeBranches.length === 0 && allBranchesInDb.length === 0) {
        const id = crypto.randomUUID();
        const now = Date.now();
        const mainBranch: Branch = {
          id,
          name: 'Main Branch',
          address: currentStore?.address || 'Main Address',
          businessId,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };
        await branchService.create(mainBranch);
        activeBranches = [mainBranch];
        await auditService.log('BRANCH_AUTO_CREATE', JSON.stringify({ name: mainBranch.name, id }));
      }

      const sortedBranches = activeBranches.sort((a, b) => b.createdAt - a.createdAt);
      setAllBranches(sortedBranches);

      const allProducts = await productService.getAll();
      setProducts(allProducts.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load store info:', error);
    } finally {
      if (!isBackgroundSync) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // 1. Instant local load
    loadStore();

    // 2. Non-blocking background sync with cloud
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      (async () => {
        try {
          await pullSync();
          await processQueue();
          await loadStore(true);
        } catch (syncError) {
          console.warn('[CloudSync] Background startup sync bypassed:', syncError);
        }
      })();
    }

    // 3. Realtime Webhook & SSE Stream subscription
    const unsubscribe = realtimeSync.subscribe(
      [STORES.STORE_INFO, STORES.BRANCHES, STORES.PRODUCTS],
      () => {
        loadStore(true);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute authorized branches for the logged-in user:
  // Admins oversee ALL branches
  // Authorized cashiers/users only get their assigned branches
  const authorizedBranches = useMemo(() => {
    if (!user) {
      return allBranches;
    }
    if (isAdmin) {
      return allBranches;
    }
    const assignedIds = user.assignedBranchIds || [];
    return allBranches.filter(b => assignedIds.includes(b.id));
  }, [user, isAdmin, allBranches]);

  // Synchronize currentBranchId with user authorization & active branches
  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Not logged in or waiting for auth
      const savedId = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_BRANCH_KEY) : null;
      if (savedId && allBranches.some(b => b.id === savedId)) {
        setCurrentBranchId(savedId);
      } else if (allBranches.length > 0) {
        setCurrentBranchId(allBranches[0].id);
      }
      return;
    }

    if (isAdmin) {
      // Admin has permission across all branches
      const savedId = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_BRANCH_KEY) : null;
      if (savedId && allBranches.some(b => b.id === savedId)) {
        setCurrentBranchId(savedId);
      } else if (allBranches.length > 0) {
        const defaultId = allBranches[0].id;
        setCurrentBranchId(defaultId);
        localStorage.setItem(CURRENT_BRANCH_KEY, defaultId);
      } else {
        setCurrentBranchId(null);
      }
    } else {
      // Non-admin / Cashier: ISOLATE strictly to authorized branches
      const assignedIds = user.assignedBranchIds || [];
      const userBranches = allBranches.filter(b => assignedIds.includes(b.id));

      if (userBranches.length > 0) {
        const savedId = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_BRANCH_KEY) : null;
        if (savedId && userBranches.some(b => b.id === savedId)) {
          setCurrentBranchId(savedId);
        } else {
          // Force to first authorized branch
          const defaultId = userBranches[0].id;
          setCurrentBranchId(defaultId);
          localStorage.setItem(CURRENT_BRANCH_KEY, defaultId);
        }
      } else {
        // User has no assigned branches
        setCurrentBranchId(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(CURRENT_BRANCH_KEY);
        }
      }
    }
  }, [user, isAdmin, allBranches, loading]);

  const isBranchAuthorized = (branchId: string): boolean => {
    if (isAdmin) return true;
    if (!user) return false;
    return (user.assignedBranchIds || []).includes(branchId);
  };

  const addBranch = async (branch: Omit<Branch, 'id' | 'createdAt' | 'updatedAt' | 'businessId' | 'isDeleted'>) => {
    if (user && !isAdmin) {
      throw new Error('Only administrators are authorized to add new branches.');
    }
    const businessId = store?.id || 'main_config';
    const id = crypto.randomUUID();
    const now = Date.now();
    const newBranch: Branch = {
      ...branch,
      id,
      businessId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await branchService.create(newBranch);
    await auditService.log('BRANCH_ADD', JSON.stringify({ name: branch.name, id }));
    await loadStore();
    return newBranch;
  };

  const updateBranch = async (branch: Branch) => {
    if (user && !isAdmin) {
      throw new Error('Only administrators are authorized to modify branches.');
    }
    await branchService.update(branch);
    await auditService.log('BRANCH_UPDATE', JSON.stringify({ name: branch.name, id: branch.id }));
    await loadStore();
  };

  const deleteBranch = async (id: string) => {
    if (user && !isAdmin) {
      throw new Error('Only administrators are authorized to delete branches.');
    }
    await branchService.delete(id);
    await auditService.log('BRANCH_DELETE', JSON.stringify({ id }));
    await loadStore();
  };

  const switchBranch = (branchId: string) => {
    if (!isBranchAuthorized(branchId)) {
      console.warn('Unauthorized branch switch attempt prevented:', branchId);
      return;
    }
    const targetBranch = allBranches.find(b => b.id === branchId);
    if (!targetBranch) return;

    setCurrentBranchId(branchId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_BRANCH_KEY, branchId);
    }
  };

  const currentBranch = allBranches.find(b => b.id === currentBranchId);

  const filteredProducts = products.filter(p => p.branchId === currentBranchId);

  const addProduct = async (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newProduct: Product = {
      ...product,
      id,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await productService.create(newProduct);
    await auditService.log('PRODUCT_ADD', JSON.stringify({ name: product.name, id }));
    await loadStore();
    return newProduct;
  };

  const updateStore = async (name: string, address: string = '', tin: string = '', taxType: 'VAT' | 'NON-VAT' = 'NON-VAT', vatRate: number = 12) => {
    const currentStore = await storeService.getById('main_config');
    const newStore: StoreInfo = {
      id: 'main_config',
      name,
      address,
      tin,
      currency: 'PHP',
      taxType,
      vatRate,
      lastORNumber: currentStore?.lastORNumber || 0,
      updatedAt: Date.now(),
    };
    await storeService.update(newStore);
    await auditService.log('STORE_SETTINGS_UPDATE', JSON.stringify({ name, taxType, tin }));
    await loadStore();
  };

  const getNextORNumber = async () => {
    const currentStore = store || (await storeService.getById('main_config'));
    const nextNum = (currentStore?.lastORNumber || 0) + 1;
    
    const updatedStore: StoreInfo = {
      ...(currentStore || {
        id: 'main_config',
        name: 'My Store',
        currency: 'PHP',
        taxType: 'NON-VAT',
        vatRate: 12,
      }),
      lastORNumber: nextNum,
      updatedAt: Date.now(),
    };
    
    await storeService.update(updatedStore);
    await loadStore();
    
    return `OR-${nextNum.toString().padStart(6, '0')}`;
  };

  return (
    <StoreContext.Provider value={{ 
      store, 
      loading, 
      updateStore, 
      getNextORNumber, 
      products: filteredProducts, 
      allProducts: products,
      addProduct,
      branches: authorizedBranches,
      allBranches,
      currentBranchId,
      currentBranch,
      addBranch,
      updateBranch,
      deleteBranch,
      switchBranch,
      isBranchAuthorized,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
