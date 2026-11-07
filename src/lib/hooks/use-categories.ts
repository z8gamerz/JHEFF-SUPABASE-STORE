'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Category, Product, STORES } from '@/lib/db/idb';
import { categoryService } from '@/lib/services/category-service';
import { productService } from '@/lib/services/product-service';
import { realtimeSync } from '@/lib/db/realtime-sync';

export interface CategoryStats {
  name: string;
  itemCount: number;
  totalStock: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export function useCategories(branchId?: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await categoryService.getCategories(branchId);
      // Case-insensitive deduplication to prevent duplicate category entries
      const uniqueMap = new Map<string, Category>();
      for (const cat of data) {
        if (!cat || cat.isDeleted) continue;
        const key = cat.name.trim().toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, cat);
        }
      }
      const sorted = Array.from(uniqueMap.values());
      // Sort alphabetically by name, keeping 'Others' at the end
      sorted.sort((a, b) => {
        if (a.name.toLowerCase() === 'others') return 1;
        if (b.name.toLowerCase() === 'others') return -1;
        return a.name.localeCompare(b.name);
      });
      setCategories(sorted);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchCategories();

    // Auto-listen to cloud webhook / realtime stream pushes for categories
    const unsubscribe = realtimeSync.subscribe([STORES.CATEGORIES], () => {
      fetchCategories();
    });

    return () => unsubscribe();
  }, [fetchCategories]);

  const addCategory = async (name: string, description?: string, color?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const existing = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      throw new Error(`Category "${trimmed}" already exists.`);
    }

    const newCat = {
      id: crypto.randomUUID(),
      name: trimmed,
      description: description?.trim() || '',
      color: color || '#ea580c',
      branchId,
      createdAt: Date.now(),
    };

    await categoryService.create(newCat);
    await fetchCategories();
    return newCat;
  };

  const updateCategory = async (category: Category) => {
    await categoryService.update(category);
    await fetchCategories();
  };

  const renameCategory = async (oldName: string, newName: string) => {
    const affected = await categoryService.renameCategoryCascade(oldName, newName);
    await fetchCategories();
    return affected;
  };

  const deleteCategory = async (id: string, fallbackCategoryName = 'Others') => {
    const affected = await categoryService.deleteCategoryAndReassign(id, fallbackCategoryName);
    await fetchCategories();
    return affected;
  };

  return {
    categories,
    loading,
    addCategory,
    updateCategory,
    renameCategory,
    deleteCategory,
    refresh: fetchCategories,
  };
}
