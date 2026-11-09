'use client';

import { useState, useMemo } from 'react';
import { Product, Supplier, RestockItem } from '@/lib/db/idb';
import { X, Plus, Trash2, Search, Save, Package, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RestockFormProps {
  products: Product[];
  suppliers: Supplier[];
  onSave: (supplierId: string, items: RestockItem[], totalCost: number, referenceNumber?: string, notes?: string) => void;
  onClose: () => void;
}

export function RestockForm({ products, suppliers, onSave, onClose }: RestockFormProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [restockItems, setRestockItems] = useState<RestockItem[]>([]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProducts = useMemo(() => 
    products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [products, searchQuery]
  );

  const totalCost = useMemo(() => 
    restockItems.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0),
    [restockItems]
  );

  const addItem = (product: Product) => {
    if (restockItems.find(item => item.productId === product.id)) return;
    setRestockItems([...restockItems, {
      productId: product.id,
      name: product.name,
      quantity: 1,
      costPrice: 0
    }]);
  };

  const removeItem = (productId: string) => {
    setRestockItems(restockItems.filter(item => item.productId !== productId));
  };

  const updateItem = (productId: string, field: keyof RestockItem, value: any) => {
    setRestockItems(restockItems.map(item => 
      item.productId === productId ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || restockItems.length === 0) return;
    onSave(selectedSupplierId, restockItems, totalCost, referenceNumber, notes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[92vh] max-h-[880px] flex flex-col overflow-hidden border-2 border-gray-200 dark:border-gray-800 transition-colors"
      >
        {/* Header */}
        <div className="p-5 sm:p-7 border-b-2 border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-2xl text-white shadow-xl shadow-indigo-500/20 shrink-0">
              <Truck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-gray-950 dark:text-white tracking-tight leading-tight">
                Record Stock
              </h3>
              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-bold">
                Add and restock items in your inventory
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 sm:p-2.5 bg-gray-200/60 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-2xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* Left Side: Product Selector */}
          <div className="w-full md:w-80 lg:w-96 border-b-2 md:border-b-0 md:border-r-2 border-gray-200 dark:border-gray-800 flex flex-col bg-gray-100/70 dark:bg-gray-950 shrink-0">
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider">
                  Select Products
                </span>
                <span className="text-[11px] font-black text-gray-700 dark:text-gray-300">
                  {filteredProducts.length} items
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-400 stroke-[2.5]" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 text-gray-950 dark:text-white rounded-xl pl-10 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 transition-all outline-none placeholder:text-gray-500 dark:placeholder:text-gray-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center text-gray-700 dark:text-gray-300 font-bold text-xs sm:text-sm">
                  No products matched your search.
                </div>
              ) : (
                filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addItem(product)}
                    className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md transition-all text-left group cursor-pointer gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-xs sm:text-sm text-gray-950 dark:text-white leading-snug break-words">
                        {product.name}
                      </p>
                      {(() => {
                        const threshold = product.minStock !== undefined ? product.minStock : 5;
                        const isLow = product.stock <= threshold;
                        return (
                          <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border mt-1 ${
                            product.stock <= 0
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
                              : isLow
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                          }`}>
                            Current Stock: {product.stock} {product.unit || ''} (Min: {threshold})
                          </span>
                        );
                      })()}
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors border border-indigo-200 dark:border-indigo-800">
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Side: Restock List */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 min-w-0">
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden p-5 sm:p-7 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-5 shrink-0">
                <div>
                  <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-2 ml-1">
                    Supplier *
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-4 py-3 text-gray-950 dark:text-white font-bold text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all cursor-pointer shadow-xs"
                  >
                    <option value="" disabled>Select a supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-2 ml-1">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Invoice or Receipt #"
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-4 py-3 text-gray-950 dark:text-white font-bold text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                  />
                </div>
              </div>

              {/* Products Table with Auto-Fit */}
              <div className="flex-1 overflow-x-auto overflow-y-auto mb-5 pr-1 min-h-0">
                <table className="w-full border-separate border-spacing-y-2.5">
                  <thead>
                    <tr className="text-left">
                      <th className="px-3 py-1.5 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider">Product</th>
                      <th className="px-3 py-1.5 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider w-24 text-center">Qty / Wt</th>
                      <th className="px-3 py-1.5 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider w-32">Cost / Unit</th>
                      <th className="px-3 py-1.5 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider w-32 text-right">Subtotal</th>
                      <th className="px-3 py-1.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {restockItems.map(item => (
                        <motion.tr
                          key={item.productId}
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 15 }}
                          className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-xs"
                        >
                          <td className="px-3.5 py-3 rounded-l-2xl">
                            <p className="font-black text-xs sm:text-sm text-gray-950 dark:text-white break-words line-clamp-2">
                              {item.name}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.productId, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 text-gray-950 dark:text-white rounded-xl px-2.5 py-1.5 text-center font-black text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.costPrice}
                              onChange={(e) => updateItem(item.productId, 'costPrice', parseFloat(e.target.value) || 0)}
                              className="w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 text-gray-950 dark:text-white rounded-xl px-2.5 py-1.5 font-black text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none"
                            />
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-black text-xs sm:text-sm text-gray-950 dark:text-white whitespace-nowrap">
                              ₱{(item.quantity * item.costPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </p>
                          </td>
                          <td className="px-3 py-3 rounded-r-2xl text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(item.productId)}
                              className="p-2 text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {restockItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-14 text-center">
                          <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 text-indigo-600 dark:text-indigo-400 border border-gray-200 dark:border-gray-700">
                            <Package className="w-8 h-8" />
                          </div>
                          <p className="text-gray-950 dark:text-white font-black text-sm">No items added to restock yet</p>
                          <p className="text-gray-700 dark:text-gray-300 font-bold text-xs mt-1">Select products from the left to record stock-in</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Actions and Auto-Fit Total */}
              <div className="mt-auto pt-4 border-t-2 border-gray-200 dark:border-gray-800 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 shrink-0">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5 ml-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 text-gray-950 dark:text-white rounded-2xl px-4 py-3 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 transition-all outline-none placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                    placeholder="Optional notes or supplier reference..."
                  />
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between xl:justify-end gap-5 shrink-0">
                  <div className="text-left xl:text-right shrink-0">
                    <p className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1 leading-tight">
                      Total Cost
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight leading-tight">
                      ₱{totalCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={restockItems.length === 0 || !selectedSupplierId}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <Save className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                    <span>Complete Restock</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
