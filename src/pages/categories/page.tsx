'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Plus, 
  FolderTree, 
  Package, 
  Edit2, 
  Trash2, 
  Search, 
  AlertTriangle, 
  TrendingUp, 
  Layers, 
  Tag, 
  X, 
  Save, 
  Check, 
  ExternalLink,
  Scale,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from '@/components/layout/header';
import { AuthGuard } from '@/components/auth/auth-guard';
import { useAuth } from '@/lib/contexts/auth-context';
import { useBranches } from '@/lib/hooks/use-branches';
import { useProducts } from '@/lib/hooks/use-products';
import { useCategories } from '@/lib/hooks/use-categories';
import { Category, Product } from '@/lib/db/idb';
import { ProductForm } from '@/components/inventory/product-form';
import { Modal } from '@/components/ui/modal';

const PALETTE_COLORS = [
  '#ea580c', // Orange
  '#2563eb', // Blue
  '#16a34a', // Green
  '#dc2626', // Red
  '#7c3aed', // Purple
  '#d97706', // Amber
  '#0891b2', // Cyan
  '#e11d48', // Rose
  '#4b5563', // Slate
];

export default function CategoriesPage() {
  const { currentBranchId } = useBranches();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { products, updateProduct, addProduct, deleteProduct, refresh: refreshProducts } = useProducts(currentBranchId || undefined);
  const { 
    categories, 
    loading: loadingCategories, 
    addCategory, 
    updateCategory, 
    renameCategory, 
    deleteCategory, 
    refresh: refreshCategories 
  } = useCategories(currentBranchId || undefined);

  // Selected category for item exploration (null = all / overview)
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryDescInput, setCategoryDescInput] = useState('');
  const [categoryColorInput, setCategoryColorInput] = useState('#ea580c');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Delete Category Confirmation Modal
  const [deleteTargetCategory, setDeleteTargetCategory] = useState<Category | null>(null);
  const [fallbackReassignCategory, setFallbackReassignCategory] = useState('Others');
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  // Product Form Modal (for adding/editing product directly within category)
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Unified, case-insensitive, deduplicated category list from master categories table and inventory items
  const unifiedCategoryList = useMemo(() => {
    const map = new Map<string, {
      id?: string;
      name: string;
      description?: string;
      color?: string;
    }>();

    // 1. Prioritize official categories from Category Page
    categories.forEach(c => {
      const cleanName = c.name?.trim();
      if (!cleanName) return;
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: c.id,
          name: cleanName,
          description: c.description,
          color: c.color || '#ea580c',
        });
      }
    });

    // 2. Incorporate any categories in products not yet officially listed
    products.forEach(p => {
      const cleanCat = p.category?.trim();
      if (!cleanCat) return;
      const key = cleanCat.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: cleanCat,
          color: '#ea580c',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.name.toLowerCase() === 'others') return 1;
      if (b.name.toLowerCase() === 'others') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [categories, products]);

  // Aggregate stats per category strictly without duplicate counts
  const categoryStatsMap = useMemo(() => {
    const map = new Map<string, {
      items: Product[];
      itemCount: number;
      totalStock: number;
      totalValue: number;
      totalCostValue: number;
      lowStockCount: number;
      outOfStockCount: number;
    }>();

    unifiedCategoryList.forEach(cat => {
      const lower = cat.name.toLowerCase();
      // Match products assigned to this category
      const catProducts = products.filter(p => (p.category || 'Others').trim().toLowerCase() === lower);
      
      const totalStock = catProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
      const totalValue = catProducts.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
      const totalCostValue = catProducts.reduce((sum, p) => sum + ((Number(p.cost) || 0) * (Number(p.stock) || 0)), 0);
      const lowStockCount = catProducts.filter(p => p.stock > 0 && p.stock <= (p.minStock !== undefined ? p.minStock : 5)).length;
      const outOfStockCount = catProducts.filter(p => p.stock <= 0).length;

      map.set(cat.name, {
        items: catProducts,
        itemCount: catProducts.length,
        totalStock: Math.round(totalStock * 1000) / 1000,
        totalValue,
        totalCostValue,
        lowStockCount,
        outOfStockCount,
      });
    });

    return map;
  }, [unifiedCategoryList, products]);

  // Overall catalog metrics strictly based on inventory
  const overallStats = useMemo(() => {
    const totalItems = products.length;
    // Total Inventory Value at Retail Price (Benta Value)
    const totalInventoryValue = products.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
    // Total Inventory Value at Cost (Puhunan Value)
    const totalCostValue = products.reduce((sum, p) => sum + ((Number(p.cost) || 0) * (Number(p.stock) || 0)), 0);
    // Total physical units/quantity on hand
    const totalStockQty = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const totalCategoriesCount = unifiedCategoryList.length;

    return {
      totalItems,
      totalInventoryValue,
      totalCostValue,
      potentialProfit: totalInventoryValue - totalCostValue,
      totalStockQty: Math.round(totalStockQty * 1000) / 1000,
      totalCategoriesCount,
    };
  }, [products, unifiedCategoryList]);

  // Filtered categories for the cards view
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return unifiedCategoryList;
    const q = categorySearch.toLowerCase().trim();
    return unifiedCategoryList.filter(cat => {
      return cat.name.toLowerCase().includes(q) || (cat.description && cat.description.toLowerCase().includes(q));
    });
  }, [unifiedCategoryList, categorySearch]);

  // Items for the currently selected category
  const activeCategoryItems = useMemo(() => {
    if (!selectedCategoryName) return [];
    const stats = categoryStatsMap.get(selectedCategoryName);
    const rawItems = stats ? stats.items : [];
    if (!itemSearch.trim()) return rawItems;
    const q = itemSearch.toLowerCase().trim();
    return rawItems.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [selectedCategoryName, categoryStatsMap, itemSearch]);

  // Open Create/Edit Category Modal
  const handleOpenCategoryModal = (cat?: Category | { id?: string; name: string; description?: string; color?: string } | string) => {
    setCategoryError(null);
    if (typeof cat === 'object' && cat !== null) {
      const existing = categories.find(c => c.name.toLowerCase() === cat.name.toLowerCase());
      if (existing) {
        setEditingCategory(existing);
        setCategoryNameInput(existing.name);
        setCategoryDescInput(existing.description || '');
        setCategoryColorInput(existing.color || '#ea580c');
      } else {
        setEditingCategory(null);
        setCategoryNameInput(cat.name);
        setCategoryDescInput(cat.description || '');
        setCategoryColorInput(cat.color || '#ea580c');
      }
    } else if (typeof cat === 'string') {
      const existing = categories.find(c => c.name.toLowerCase() === cat.toLowerCase());
      if (existing) {
        setEditingCategory(existing);
        setCategoryNameInput(existing.name);
        setCategoryDescInput(existing.description || '');
        setCategoryColorInput(existing.color || '#ea580c');
      } else {
        setEditingCategory(null);
        setCategoryNameInput(cat);
        setCategoryDescInput('');
        setCategoryColorInput('#ea580c');
      }
    } else {
      setEditingCategory(null);
      setCategoryNameInput('');
      setCategoryDescInput('');
      setCategoryColorInput(PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]);
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryNameInput.trim()) {
      setCategoryError('Category name is required.');
      return;
    }

    setIsSavingCategory(true);
    setCategoryError(null);
    try {
      if (editingCategory) {
        // If name changed, rename with cascade
        if (editingCategory.name.trim().toLowerCase() !== categoryNameInput.trim().toLowerCase()) {
          await renameCategory(editingCategory.name, categoryNameInput.trim());
          if (selectedCategoryName === editingCategory.name) {
            setSelectedCategoryName(categoryNameInput.trim());
          }
        }
        await updateCategory({
          ...editingCategory,
          name: categoryNameInput.trim(),
          description: categoryDescInput.trim(),
          color: categoryColorInput,
          updatedAt: Date.now(),
        });
      } else {
        await addCategory(categoryNameInput.trim(), categoryDescInput.trim(), categoryColorInput);
      }
      setIsCategoryModalOpen(false);
      await refreshProducts();
    } catch (err: any) {
      setCategoryError(err.message || 'Failed to save category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategoryPrompt = (catName: string) => {
    const existing = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (existing) {
      setDeleteTargetCategory(existing);
    } else {
      setDeleteTargetCategory({
        id: crypto.randomUUID(),
        name: catName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    setFallbackReassignCategory('Others');
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deleteTargetCategory) return;
    setIsDeletingCategory(true);
    try {
      await deleteCategory(deleteTargetCategory.id, fallbackReassignCategory);
      if (selectedCategoryName === deleteTargetCategory.name) {
        setSelectedCategoryName(null);
      }
      setDeleteTargetCategory(null);
      await refreshProducts();
      await refreshCategories();
    } catch (err) {
      console.error('Failed to delete category:', err);
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // Quick reassign product to another category
  const handleQuickReassign = async (product: Product, newCategory: string) => {
    if (product.category === newCategory) return;
    await updateProduct({
      ...product,
      category: newCategory,
      updatedAt: Date.now(),
    });
    await refreshProducts();
  };

  // Save Product (from ProductForm)
  const handleSaveProduct = async (productData: any) => {
    if (editingProduct?.id) {
      await updateProduct(productData);
    } else {
      await addProduct({
        ...productData,
        branchId: currentBranchId || 'main',
      });
    }
    await refreshProducts();
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors flex flex-col">
        <Header />

        <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 flex-1">
          {/* Top Title & Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3.5">
              <Link 
                href="/"
                className="p-2.5 sm:p-3 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl transition-all text-gray-700 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white border-2 border-gray-200 dark:border-gray-800 shadow-xs cursor-pointer shrink-0"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight leading-tight">
                    Categories
                  </h2>
                  <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-xl border border-emerald-300 dark:border-emerald-800">
                    {overallStats.totalCategoriesCount} Groups
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-bold mt-0.5">
                  Organize, group, and fetch items by category for easy inventory management.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <Link
                href="/products"
                className="px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white font-black text-xs uppercase tracking-wider rounded-2xl border-2 border-gray-200 dark:border-gray-800 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <Package className="w-4 h-4 stroke-[2.5]" />
                <span>Full Inventory</span>
              </Link>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleOpenCategoryModal()}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>New Category</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar strictly computed from current inventory */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border-2 border-gray-200 dark:border-gray-800 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-2xl">
                  <FolderTree className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Total Categories</span>
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight">
                {overallStats.totalCategoriesCount}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">Master product groups</p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border-2 border-gray-200 dark:border-gray-800 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 rounded-2xl">
                  <Package className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Catalog Products</span>
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight">
                {overallStats.totalItems}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">Unique products in store</p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border-2 border-gray-200 dark:border-gray-800 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 rounded-2xl">
                  <TrendingUp className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Total Stock Value</span>
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-orange-600 dark:text-orange-400 tracking-tight">
                ₱{overallStats.totalInventoryValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">
                Puhunan: ₱{overallStats.totalCostValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border-2 border-gray-200 dark:border-gray-800 shadow-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 rounded-2xl">
                  <Layers className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Units / Quantity</span>
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight">
                {overallStats.totalStockQty.toLocaleString()}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">Total physical stock on hand</p>
            </div>
          </div>

          {/* Main Layout: Split between Category List and Items In Category */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Categories List & Filter */}
            <div className={`${selectedCategoryName ? 'lg:col-span-5 xl:col-span-4' : 'lg:col-span-12'} space-y-4`}>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-gray-900 p-4 rounded-3xl border-2 border-gray-200 dark:border-gray-800 shadow-xs">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search category name..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 text-gray-950 dark:text-white pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 text-xs font-bold outline-none focus:border-emerald-500 transition-all placeholder:text-gray-400"
                  />
                </div>
                {selectedCategoryName && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryName(null)}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-700 dark:text-gray-300 font-bold text-xs shrink-0 cursor-pointer transition-colors"
                  >
                    View All Groups
                  </button>
                )}
              </div>

              {/* Category Cards Grid */}
              <div className={`grid ${selectedCategoryName ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'} gap-4`}>
                {filteredCategories.map(cat => {
                  const stats = categoryStatsMap.get(cat.name) || {
                    items: [],
                    itemCount: 0,
                    totalStock: 0,
                    totalValue: 0,
                    totalCostValue: 0,
                    lowStockCount: 0,
                    outOfStockCount: 0,
                  };
                  const isSelected = selectedCategoryName === cat.name;
                  const catColor = cat.color || '#ea580c';

                  return (
                    <motion.div
                      key={cat.name}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white dark:bg-gray-900 rounded-3xl p-5 border-2 transition-all cursor-pointer flex flex-col justify-between group relative shadow-xs ${
                        isSelected 
                          ? 'border-emerald-500 dark:border-emerald-500 ring-4 ring-emerald-500/10 shadow-md' 
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md'
                      }`}
                      onClick={() => setSelectedCategoryName(cat.name)}
                    >
                      <div>
                        {/* Header: Color pill & action icons */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs" 
                              style={{ backgroundColor: catColor }} 
                            />
                            <h4 className="font-black text-base sm:text-lg text-gray-950 dark:text-white truncate tracking-tight">
                              {cat.name}
                            </h4>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleOpenCategoryModal(cat)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg transition-colors cursor-pointer"
                                title="Edit Category"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategoryPrompt(cat.name)}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-lg transition-colors cursor-pointer"
                                title="Delete Category"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {cat.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium line-clamp-2 mb-4">
                            {cat.description}
                          </p>
                        )}
                      </div>

                      {/* Stats Section */}
                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 mt-2 space-y-2">
                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="text-gray-500 dark:text-gray-400 uppercase tracking-wider">Products:</span>
                          <span className="text-gray-950 dark:text-white px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800">
                            {stats.itemCount} items
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="text-gray-500 dark:text-gray-400 uppercase tracking-wider">Units in Stock:</span>
                          <span className="text-gray-950 dark:text-white font-black">
                            {stats.totalStock.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock Value:</span>
                          <span className="text-orange-600 dark:text-orange-400 font-black">
                            ₱{stats.totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Warnings */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          {stats.outOfStockCount > 0 && (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-900">
                              {stats.outOfStockCount} Out of Stock
                            </span>
                          )}
                          {stats.lowStockCount > 0 && (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-900">
                              {stats.lowStockCount} Low Stock
                            </span>
                          )}
                        </div>

                        <div className="pt-2 flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            {isSelected ? 'Viewing items below' : 'Click to view items →'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>



            {/* Right Column: Fetched Items in Selected Category */}
            {selectedCategoryName && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-7 border-2 border-gray-200 dark:border-gray-800 shadow-sm flex flex-col min-h-[500px]"
              >
                {/* Detail Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-200 dark:border-gray-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Category Details
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 text-[10px] font-black uppercase rounded-md">
                        {activeCategoryItems.length} Products Found
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-gray-950 dark:text-white tracking-tight mt-0.5">
                      {selectedCategoryName}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct({
                            id: '',
                            name: '',
                            price: 0,
                            cost: 0,
                            stock: 0,
                            category: selectedCategoryName,
                            branchId: currentBranchId || 'main',
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                          });
                          setIsProductFormOpen(true);
                        }}
                        className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>Add Item to {selectedCategoryName}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryName(null)}
                      className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-gray-500 transition-colors cursor-pointer"
                      title="Close view"
                    >
                      <X className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>

                {/* Search within Category */}
                <div className="py-4">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={`Search products inside ${selectedCategoryName}...`}
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 text-gray-950 dark:text-white pl-10 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-xs sm:text-sm font-bold outline-none focus:border-emerald-500 transition-all placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {activeCategoryItems.length === 0 ? (
                    <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                      <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p className="font-black text-base text-gray-800 dark:text-gray-200">
                        No products found in this category
                      </p>
                      <p className="text-xs font-medium mt-1">
                        Add a product or reassign existing products to "{selectedCategoryName}".
                      </p>
                    </div>
                  ) : (
                    activeCategoryItems.map(product => {
                      const isOutOfStock = product.stock <= 0;
                      const effectiveThreshold = product.minStock !== undefined ? product.minStock : 5;
                      const isLowStock = !isOutOfStock && product.stock <= effectiveThreshold;

                      return (
                        <div
                          key={product.id}
                          className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-100/80 dark:hover:bg-gray-800 transition-all"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="font-black text-base text-gray-950 dark:text-white truncate">
                                {product.name}
                              </h5>
                              {product.isWeightBased && (
                                <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md border border-amber-300 dark:border-amber-800 flex items-center gap-0.5 shrink-0">
                                  <Scale className="w-2.5 h-2.5" />
                                  <span>{product.unit || 'KG'}</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-xs font-bold text-gray-600 dark:text-gray-300">
                              <span className="text-orange-600 dark:text-orange-400 font-black text-sm">
                                ₱{product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })} / {product.unit || 'pc'}
                              </span>
                              <span>•</span>
                              <span className={`font-black ${
                                isOutOfStock 
                                  ? 'text-rose-600' 
                                  : isLowStock 
                                  ? 'text-amber-600' 
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}>
                                Stock: {product.stock} {product.unit || 'pcs'}
                              </span>
                            </div>
                          </div>

                          {/* Quick Category Reassign & Edit Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isAdmin && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-gray-500 hidden xl:inline">Move to:</span>
                                <select
                                  value={product.category}
                                  onChange={(e) => handleQuickReassign(product, e.target.value)}
                                  className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-2.5 py-1.5 text-xs font-bold cursor-pointer outline-none focus:border-emerald-500 shadow-2xs"
                                  title="Change category for this item"
                                >
                                  {unifiedCategoryList.map(c => (
                                    <option key={c.name} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProduct(product);
                                  setIsProductFormOpen(true);
                                }}
                                className="p-2 bg-white dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer"
                                title="Edit Product"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </main>

        {/* Modal: Add or Edit Category */}
        <Modal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          title={editingCategory ? 'Edit Category' : 'Create New Category'}
        >
          <form onSubmit={handleSaveCategory} className="space-y-5">
            {categoryError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{categoryError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-black uppercase text-gray-950 dark:text-white tracking-wider mb-2 ml-1">
                Category Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rice & Grains, Inumin, Chichirya..."
                value={categoryNameInput}
                onChange={(e) => setCategoryNameInput(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 text-gray-950 dark:text-white px-4 py-3.5 rounded-2xl border-2 border-gray-300 dark:border-gray-700 text-sm font-bold outline-none focus:border-emerald-500 transition-all placeholder:text-gray-400"
              />
              {editingCategory && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1.5 ml-1">
                  Renaming this category will automatically update all products assigned to "{editingCategory.name}".
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-950 dark:text-white tracking-wider mb-2 ml-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Brief description of items under this group..."
                value={categoryDescInput}
                onChange={(e) => setCategoryDescInput(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 text-gray-950 dark:text-white px-4 py-3 rounded-2xl border-2 border-gray-300 dark:border-gray-700 text-sm font-bold outline-none focus:border-emerald-500 transition-all placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-950 dark:text-white tracking-wider mb-2 ml-1">
                Badge Color
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PALETTE_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoryColorInput(c)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border-2"
                    style={{ 
                      backgroundColor: c, 
                      borderColor: categoryColorInput === c ? '#000000' : 'transparent',
                      transform: categoryColorInput === c ? 'scale(1.15)' : 'scale(1)'
                    }}
                  >
                    {categoryColorInput === c && (
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-black text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingCategory}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSavingCategory ? (
                  <span className="animate-spin border-2 border-white/30 border-t-white rounded-full w-4 h-4" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{editingCategory ? 'Update Category' : 'Save Category'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Delete Category & Reassign Products */}
        <Modal
          isOpen={!!deleteTargetCategory}
          onClose={() => setDeleteTargetCategory(null)}
          title="Delete Category"
        >
          {deleteTargetCategory && (
            <div className="space-y-5 text-gray-900 dark:text-white">
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-black text-rose-950 dark:text-rose-200">
                    Are you sure you want to delete the category "{deleteTargetCategory.name}"?
                  </p>
                  <p className="text-rose-800 dark:text-rose-300 font-medium mt-1">
                    Existing products in this category will not be lost. Please select which category they should be moved to:
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2 ml-1 text-gray-700 dark:text-gray-300">
                  Reassign existing items to:
                </label>
                <select
                  value={fallbackReassignCategory}
                  onChange={(e) => setFallbackReassignCategory(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 text-gray-950 dark:text-white px-4 py-3.5 rounded-2xl border-2 border-gray-300 dark:border-gray-700 font-bold text-sm outline-none focus:border-rose-500 cursor-pointer"
                >
                  {unifiedCategoryList
                    .filter(c => c.name.toLowerCase() !== deleteTargetCategory.name.toLowerCase())
                    .map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  <option value="Others">Others</option>
                </select>
              </div>

              <div className="pt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTargetCategory(null)}
                  className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-black text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingCategory}
                  onClick={handleConfirmDeleteCategory}
                  className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDeletingCategory ? (
                    <span className="animate-spin border-2 border-white/30 border-t-white rounded-full w-4 h-4" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete & Reassign</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Product Modal for creating/editing product directly within the Category page */}
        {isProductFormOpen && (
          <ProductForm
            product={editingProduct}
            onSave={handleSaveProduct}
            onClose={() => {
              setIsProductFormOpen(false);
              setEditingProduct(null);
            }}
          />
        )}
      </div>
    </AuthGuard>
  );
}
