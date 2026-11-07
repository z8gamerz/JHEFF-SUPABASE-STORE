'use client';

import { useState, useMemo, useDeferredValue } from 'react';
import { useProducts } from '@/lib/hooks/use-products';
import { useBranches } from '@/lib/hooks/use-branches';
import { useAuth } from '@/lib/contexts/auth-context';
import { useCategories } from '@/lib/hooks/use-categories';
import { Header } from '@/components/layout/header';
import { ProductList } from '@/components/inventory/product-list';
import { ProductForm } from '@/components/inventory/product-form';
import { CsvImport } from '@/components/inventory/csv-import';
import { ConfirmModal } from '@/components/ui/modal';
import { Plus, Search, Package, ArrowLeft, Upload, Download, ShieldAlert, AlertTriangle, AlertCircle, ArrowRight, FolderTree, Layers, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Product } from '@/lib/db/idb';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function ProductsPage() {
  const { currentBranchId, loading: loadingBranches, isBranchAuthorized } = useBranches();
  const { isAdmin, isCashier } = useAuth();
  const { products, loading, addProduct, addProducts, updateProduct, deleteProduct } = useProducts(currentBranchId || undefined);
  const { categories } = useCategories();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('inventory_low_stock_threshold');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return 10;
  });

  const handleUpdateThreshold = (val: number) => {
    const clamped = Math.max(1, Math.min(9999, val));
    setLowStockThreshold(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem('inventory_low_stock_threshold', String(clamped));
    }
  };

  const deferredSearch = useDeferredValue(searchQuery);

  // Accurate Inventory Metrics strictly based on actual inventory
  const inventoryStats = useMemo(() => {
    const totalItems = products.length;
    // Total Inventory Value at Retail Price (Benta Value)
    const totalInventoryValue = products.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
    // Total Inventory Value at Cost (Puhunan Value)
    const totalCostValue = products.reduce((sum, p) => sum + ((Number(p.cost) || 0) * (Number(p.stock) || 0)), 0);
    // Total physical units on hand
    const totalStockQty = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    return {
      totalItems,
      totalInventoryValue,
      totalCostValue,
      totalStockQty: Math.round(totalStockQty * 1000) / 1000,
      totalCategories: categories.length,
    };
  }, [products, categories]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => {
      const threshold = p.minStock !== undefined && p.minStock > 0 ? p.minStock : lowStockThreshold;
      return p.stock <= threshold;
    }).length;
  }, [products, lowStockThreshold]);

  const outOfStockCount = useMemo(() => {
    return products.filter(p => p.stock <= 0).length;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    let list = products;
    if (selectedCategory && selectedCategory !== 'ALL') {
      list = list.filter(p => (p.category || 'Others').trim().toLowerCase() === selectedCategory.toLowerCase());
    }
    if (q) {
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    if (showLowStockOnly) {
      list = list.filter(p => {
        const threshold = p.minStock !== undefined && p.minStock > 0 ? p.minStock : lowStockThreshold;
        return p.stock <= threshold;
      });
    }
    return list;
  }, [products, deferredSearch, selectedCategory, showLowStockOnly, lowStockThreshold]);

  const isAuthorized = !!currentBranchId && isBranchAuthorized(currentBranchId);

  if (!loadingBranches && !isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col font-sans transition-colors">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-[3rem] p-12 text-center border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none">
            <div className="w-24 h-24 bg-red-50 dark:bg-rose-950/40 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 text-red-600 dark:text-red-400">
              <Package className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase mb-4">No Branch Access</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium leading-relaxed mb-8">
              You are not authorized to access this branch. Please contact your administrator to get access.
            </p>
            <Link 
              href="/"
              className="inline-flex items-center gap-3 px-8 py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleExport = async () => {
    const exportData = filteredProducts.map(p => ({
      name: p.name,
      price: p.price,
      qty: p.stock,
      total: p.price * p.stock,
      date: new Date(p.createdAt).toLocaleDateString()
    }));

    const Papa = (await import('papaparse')).default;
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `products-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEdit = (product: Product) => {
    if (!isAdmin) return;
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleSave = async (data: any) => {
    if (!isAdmin) return;
    if (editingProduct) {
      await updateProduct(data);
    } else {
      await addProduct({ ...data, branchId: currentBranchId! });
    }
  };

  const handleBulkImport = async (data: any[]) => {
    if (!isAdmin || !currentBranchId) return;
    const productsWithBranch = data.map(p => ({ ...p, branchId: currentBranchId }));
    await addProducts(productsWithBranch);
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (deleteConfirmId) {
      await deleteProduct(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
        <Header />
        
        <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="p-2 hover:bg-white rounded-xl transition-colors text-gray-400 hover:text-gray-900 border border-transparent hover:border-gray-200"
              >
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <div>
                <h2 className="text-3xl font-black text-gray-950 dark:text-white tracking-tight">Inventory</h2>
                <p className="text-gray-600 dark:text-gray-300 font-bold text-sm mt-0.5">Manage your store products and stock.</p>
              </div>
            </div>
  
            {!isCashier && (
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href="/categories"
                  className="bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white font-black px-5 py-4 rounded-2xl flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 shadow-sm transition-all active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <FolderTree className="w-5 h-5 text-emerald-600" />
                  <span>Categories</span>
                </Link>
                <button
                  onClick={handleExport}
                  className="bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white font-black px-6 py-4 rounded-2xl flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 shadow-sm transition-all active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <Download className="w-5 h-5" />
                  Export CSV
                </button>
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white font-black px-6 py-4 rounded-2xl flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 shadow-sm transition-all active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <Upload className="w-5 h-5" />
                  Import CSV
                </button>
                <button
                  onClick={() => {
                    setEditingProduct(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <Plus className="w-5 h-5" />
                  Add New Product
                </button>
              </div>
            )}
          </div>

          {/* Inventory Overview Metrics Bar strictly computed from current inventory */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Link
              href="/categories"
              className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border-2 border-gray-200 dark:border-gray-800 shadow-xs hover:border-emerald-500 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-2xl group-hover:scale-105 transition-transform">
                  <FolderTree className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Categories</span>
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight">
                {inventoryStats.totalCategories}
              </p>
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">Manage Categories →</p>
            </Link>

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
                {inventoryStats.totalItems}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">Unique items in store</p>
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
                ₱{inventoryStats.totalInventoryValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">
                Puhunan: ₱{inventoryStats.totalCostValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                {inventoryStats.totalStockQty.toLocaleString()}
              </p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">Total physical stock on hand</p>
            </div>
          </div>
  
          {isCashier && (
            <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-950/40 rounded-3xl border border-blue-200 dark:border-blue-900 flex items-center gap-4 text-blue-950 dark:text-blue-200">
              <div className="bg-blue-600 p-3 rounded-2xl text-white">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <p className="font-black uppercase tracking-widest text-[10px] mb-1 opacity-90">Cashier Mode</p>
                <p className="font-bold">You have read-only access to the inventory. Product editing is disabled.</p>
              </div>
            </div>
          )}
  
          {/* Low Stock Alert Banner */}
          {lowStockCount > 0 && (
            <div className="mb-6 p-5 sm:p-6 bg-amber-50 dark:bg-amber-950/40 rounded-3xl border-2 border-amber-300 dark:border-amber-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4 text-amber-950 dark:text-amber-100 shadow-sm transition-all">
              <div className="flex items-center gap-4">
                <div className="bg-amber-500 text-white p-3 rounded-2xl shadow-md shadow-amber-500/20 shrink-0">
                  <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black uppercase tracking-wider text-xs bg-amber-200 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 px-2 py-0.5 rounded-md">
                      Inventory Alert
                    </span>
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                      Definable Threshold: ≤ {lowStockThreshold} units
                    </span>
                  </div>
                  <p className="font-black text-base sm:text-lg tracking-tight mt-1">
                    {lowStockCount} {lowStockCount === 1 ? 'product requires' : 'products require'} restocking!
                    {outOfStockCount > 0 && (
                      <span className="text-rose-700 dark:text-rose-400 font-black ml-1.5">
                        ({outOfStockCount} completely out of stock)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border-2 ${
                    showLowStockOnly
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white dark:bg-gray-900 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                  }`}
                >
                  {showLowStockOnly ? 'Show All Products' : 'Filter Low Stock Only'}
                </button>
                <Link
                  href="/restocking"
                  className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all inline-flex items-center gap-1.5"
                >
                  <span>Restock</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </Link>
              </div>
            </div>
          )}

          {/* Controls: Search, Category Filter & Definable Low Stock Threshold */}
          <div className="flex flex-col lg:flex-row gap-4 mb-8">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-4 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-2xl border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none transition-all font-bold placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
            </div>

            {/* Category Filter Selector - Fetched from Category Page */}
            <div className="sm:w-60 shrink-0">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full h-14 px-4 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-2xl border-2 border-gray-300 dark:border-gray-700 shadow-sm focus:border-orange-500 font-bold text-xs sm:text-sm outline-none cursor-pointer"
                title="Filter by category fetched from Category Page"
              >
                <option value="ALL">All Categories ({products.length})</option>
                {categories.map((c) => {
                  const count = products.filter(p => (p.category || 'Others').trim().toLowerCase() === c.name.toLowerCase()).length;
                  return (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Definable Low Stock Threshold Selector */}
            <div className="bg-white dark:bg-gray-900 px-4 py-2.5 rounded-2xl border-2 border-gray-300 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 stroke-[2.5]" />
                <span className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200 whitespace-nowrap">
                  Low Stock Threshold:
                </span>
              </div>

              {/* Stepper & Direct Numeric Input */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUpdateThreshold(lowStockThreshold - 1)}
                  disabled={lowStockThreshold <= 1}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-900 dark:text-white font-black text-sm flex items-center justify-center cursor-pointer transition-colors"
                  title="Decrease threshold"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={lowStockThreshold}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    if (!isNaN(parsed)) handleUpdateThreshold(parsed);
                  }}
                  className="w-14 h-8 text-center bg-gray-50 dark:bg-gray-800 text-gray-950 dark:text-white font-black text-sm rounded-lg border border-gray-300 dark:border-gray-700 outline-none focus:border-orange-500"
                  title="Definable low stock threshold count"
                />
                <button
                  type="button"
                  onClick={() => handleUpdateThreshold(lowStockThreshold + 1)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-black text-sm flex items-center justify-center cursor-pointer transition-colors"
                  title="Increase threshold"
                >
                  +
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1 border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-3">
                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mr-1 hidden md:inline">Presets:</span>
                {[5, 10, 15, 20].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleUpdateThreshold(preset)}
                    className={`px-2.5 py-1 rounded-md text-xs font-black transition-all cursor-pointer ${
                      lowStockThreshold === preset
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Quick Low Stock Toggle Filter */}
              <button
                type="button"
                onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                  showLowStockOnly
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
                }`}
                title="Toggle viewing only low stock items"
              >
                <span>Low Stock Only</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  showLowStockOnly ? 'bg-white text-amber-600' : 'bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-200'
                }`}>
                  {lowStockCount}
                </span>
              </button>
            </div>
          </div>
  
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin border-4 border-orange-200 border-t-orange-600 rounded-full w-12 h-12 mb-4" />
              <p className="text-gray-500 font-medium">Loading inventory...</p>
            </div>
          ) : (
            <ProductList 
              products={filteredProducts} 
              categories={categories}
              lowStockThreshold={lowStockThreshold}
              onEdit={isAdmin ? handleEdit : undefined} 
              onDelete={isAdmin ? handleDelete : undefined} 
            />
          )}
        </div>
  
        {isFormOpen && (
          <ProductForm 
            product={editingProduct}
            onSave={handleSave}
            onClose={() => setIsFormOpen(false)}
          />
        )}
        
        {isImportOpen && (
          <CsvImport 
            onImport={handleBulkImport}
            onClose={() => setIsImportOpen(false)}
          />
        )}
  
        <ConfirmModal
          isOpen={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          onConfirm={confirmDelete}
          title="Delete Product"
          message="Are you sure you want to delete this product? This action cannot be undone."
          variant="danger"
          confirmText="Delete"
        />
      </div>
    </AuthGuard>
  );
}
