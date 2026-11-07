'use client';

import { BaseService } from './base-service';
import { Category, STORES, Product } from '@/lib/db/idb';
import { productService } from './product-service';

export const DEFAULT_CATEGORIES: Array<Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>> = [
  { name: 'Rice & Grains', description: 'Bigas, grains, and flour products', color: '#ea580c' },
  { name: 'Canned Goods', description: 'Sardinas, corned beef, tuna, at delata', color: '#dc2626' },
  { name: 'Drinks & Beverages', description: 'Softdrinks, juices, water, at kape', color: '#2563eb' },
  { name: 'Snacks & Biscuits', description: 'Chichirya, chips, candies, at tinapay', color: '#d97706' },
  { name: 'Produce', description: 'Sariwang gulay, sibuyas, bawang, at prutas', color: '#16a34a' },
  { name: 'Meat & Poultry', description: 'Karne ng baboy, manok, baka, at itlog', color: '#e11d48' },
  { name: 'Seasonings & Condiments', description: 'Toyo, suka, mantika, asin, at pampalasa', color: '#7c3aed' },
  { name: 'Essentials & Toiletries', description: 'Sabon, shampoo, toothpaste, at panlinis', color: '#0891b2' },
  { name: 'Others', description: 'Miscellaneous products', color: '#4b5563' },
];

class CategoryService extends BaseService<Category> {
  constructor() {
    super(STORES.CATEGORIES);
  }

  async getCategories(branchId?: string): Promise<Category[]> {
    const all = await this.getAll();
    if (all.length === 0) {
      await this.initDefaultCategories(branchId);
      return await this.getAll();
    }
    // Return all active categories so products and inventory forms can always fetch master categories
    return all.filter(c => !c.isDeleted);
  }

  async initDefaultCategories(branchId?: string): Promise<void> {
    const existing = await this.getAll();
    if (existing.length > 0) return;

    const now = Date.now();
    for (const cat of DEFAULT_CATEGORIES) {
      await this.create({
        id: crypto.randomUUID(),
        name: cat.name,
        description: cat.description,
        color: cat.color,
        branchId,
        createdAt: now,
      });
    }
  }

  /**
   * Renames a category and cascades the name update to all associated products.
   */
  async renameCategoryCascade(oldName: string, newName: string): Promise<number> {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (trimmedOld.toLowerCase() === trimmedNew.toLowerCase()) return 0;

    // 1. Update the category record
    const allCategories = await this.getAll();
    const targetCat = allCategories.find(c => c.name.toLowerCase() === trimmedOld.toLowerCase());
    if (targetCat) {
      await this.update({
        ...targetCat,
        name: trimmedNew,
        updatedAt: Date.now(),
      });
    }

    // 2. Cascade update all matching products
    const allProducts = await productService.getAll();
    const affected = allProducts.filter(p => p.category.toLowerCase() === trimmedOld.toLowerCase());
    for (const prod of affected) {
      await productService.update({
        ...prod,
        category: trimmedNew,
        updatedAt: Date.now(),
      });
    }

    return affected.length;
  }

  /**
   * Deletes a category and safely reassigns products to a fallback category (default: 'Others').
   */
  async deleteCategoryAndReassign(id: string, fallbackCategoryName = 'Others'): Promise<number> {
    const category = await this.getById(id);
    if (!category) return 0;

    // Reassign products
    const allProducts = await productService.getAll();
    const affected = allProducts.filter(p => p.category.toLowerCase() === category.name.toLowerCase());
    for (const prod of affected) {
      await productService.update({
        ...prod,
        category: fallbackCategoryName,
        updatedAt: Date.now(),
      });
    }

    // Delete category
    await this.delete(id);
    return affected.length;
  }
}

export const categoryService = new CategoryService();
