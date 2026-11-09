'use client';

import { useState, useEffect, useCallback } from 'react';
import { Product, STORES } from '@/lib/db/idb';
import { productService } from '@/lib/services/product-service';
import { auditService } from '@/lib/services/audit-service';
import { realtimeSync } from '@/lib/db/realtime-sync';

export function useProducts(branchId?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      let data: Product[];
      if (branchId) {
        data = await productService.getByBranch(branchId);
      } else {
        data = await productService.getAll();
      }
      
      // Strict deduplication by product id to ensure no duplicated items or quantities
      const uniqueMap = new Map<string, Product>();
      for (const p of data) {
        if (!p || p.isDeleted) continue;
        const existing = uniqueMap.get(p.id);
        if (!existing || (p.updatedAt || 0) > (existing.updatedAt || 0)) {
          uniqueMap.set(p.id, p);
        }
      }

      const cleanProducts = Array.from(uniqueMap.values())
        .map(p => ({
          ...p,
          minStock: (p.minStock !== undefined && p.minStock !== null && !isNaN(p.minStock)) ? p.minStock : 5,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setProducts(cleanProducts);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchProducts();

    // Auto-listen to cloud webhook / realtime stream pushes
    const unsubscribe = realtimeSync.subscribe([STORES.PRODUCTS], () => {
      fetchProducts();
    });

    return () => unsubscribe();
  }, [fetchProducts]);

  const addProduct = async (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const resolvedMinStock = (product.minStock !== undefined && product.minStock !== null && !isNaN(product.minStock)) 
      ? Number(product.minStock) 
      : 5;

    const newProduct: Product = {
      ...product,
      minStock: resolvedMinStock,
      id,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    await productService.create(newProduct);
    await auditService.log('PRODUCT_ADD', JSON.stringify({ name: product.name, id, minStock: resolvedMinStock }));
    await fetchProducts();
    return newProduct;
  };

  const addProducts = async (products: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>[]) => {
    const now = Date.now();
    const newProducts: Product[] = products.map(p => {
      const resolvedMinStock = (p.minStock !== undefined && p.minStock !== null && !isNaN(p.minStock)) 
        ? Number(p.minStock) 
        : 5;
      return {
        ...p,
        minStock: resolvedMinStock,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      };
    });

    await productService.bulkCreate(newProducts);
    
    await auditService.log('PRODUCT_BULK_ADD', JSON.stringify({ count: newProducts.length }));
    await fetchProducts();
  };

  const updateProduct = async (product: Product) => {
    const resolvedMinStock = (product.minStock !== undefined && product.minStock !== null && !isNaN(product.minStock)) 
      ? Number(product.minStock) 
      : 5;

    await productService.update({
      ...product,
      minStock: resolvedMinStock,
      updatedAt: Date.now(),
    });
    await auditService.log('PRODUCT_EDIT', JSON.stringify({ name: product.name, id: product.id, minStock: resolvedMinStock }));
    await fetchProducts();
  };

  const fixAllMinStockTo5 = async (): Promise<number> => {
    const all = await productService.getAll();
    let updatedCount = 0;
    const now = Date.now();
    for (const p of all) {
      if (!p || p.isDeleted) continue;
      if (p.minStock !== 5) {
        await productService.update({
          ...p,
          minStock: 5,
          updatedAt: now,
        });
        updatedCount++;
      }
    }
    await auditService.log('BULK_MIN_STOCK_FIX_5', JSON.stringify({ targetMinStock: 5, updatedCount }));
    await fetchProducts();
    return updatedCount;
  };

  const setAllStockQuantity = async (targetQty: number = 10): Promise<number> => {
    const all = await productService.getAll();
    let updatedCount = 0;
    const now = Date.now();
    for (const p of all) {
      if (!p || p.isDeleted) continue;
      await productService.update({
        ...p,
        stock: targetQty,
        updatedAt: now,
      });
      updatedCount++;
    }
    await auditService.log('BULK_STOCK_SCALE', JSON.stringify({ targetStock: targetQty, updatedCount }));
    await fetchProducts();
    return updatedCount;
  };

  const deleteProduct = async (id: string) => {
    await productService.delete(id);
    await auditService.log('PRODUCT_DELETE', JSON.stringify({ id }));
    await fetchProducts();
  };

  return {
    products,
    loading,
    addProduct,
    addProducts,
    updateProduct,
    fixAllMinStockTo5,
    setAllStockQuantity,
    deleteProduct,
    refresh: fetchProducts,
  };
}
