'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/lib/db/idb';
import { X, Save, Package, Tag, Hash, Coins, MapPin, AlertTriangle, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { useBranches } from '@/lib/hooks/use-branches';
import { useCategories } from '@/lib/hooks/use-categories';

interface ProductFormProps {
  product?: Product | null;
  onSave: (product: any) => Promise<void>;
  onClose: () => void;
}

export function ProductForm({ product, onSave, onClose }: ProductFormProps) {
  const { branches, currentBranchId } = useBranches();
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    cost: '',
    stock: '',
    minStock: '',
    category: '',
    barcode: '',
    branchId: '',
    unit: 'pc',
    isWeightBased: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const { categories, addCategory } = useCategories(formData.branchId || currentBranchId || undefined);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        price: product.price.toString(),
        cost: (product.cost || 0).toString(),
        stock: product.stock.toString(),
        minStock: product.minStock !== undefined ? product.minStock.toString() : '',
        category: product.category || (categories[0]?.name || 'Others'),
        barcode: product.barcode || '',
        branchId: product.branchId,
        unit: product.unit || (product.isWeightBased ? 'kg' : 'pc'),
        isWeightBased: Boolean(product.isWeightBased),
      });
    } else if (currentBranchId) {
      setFormData(prev => ({ 
        ...prev, 
        branchId: currentBranchId, 
        category: prev.category || (categories[0]?.name || 'Others'),
        minStock: '',
        unit: 'pc',
        isWeightBased: false,
      }));
    }
  }, [product, currentBranchId, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.branchId) {
      alert('Please select a branch.');
      return;
    }
    setIsSaving(true);
    try {
      const isWeight = Boolean(formData.isWeightBased);
      const parsedStock = isWeight ? parseFloat(formData.stock) || 0 : parseFloat(formData.stock) || 0;
      const parsedMinStock = formData.minStock 
        ? (isWeight ? parseFloat(formData.minStock) : parseFloat(formData.minStock)) 
        : undefined;

      const data = {
        ...formData,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0,
        stock: parsedStock,
        minStock: parsedMinStock,
        isWeightBased: isWeight,
        unit: formData.unit || (isWeight ? 'kg' : 'pc'),
      };
      if (product?.id) {
        await onSave({ ...data, id: product.id, createdAt: product.createdAt });
      } else {
        await onSave(data);
      }
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-800 transition-colors my-auto"
      >
        <div className="px-6 sm:px-8 py-5 sm:py-6 border-b-2 border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-2.5 rounded-2xl text-white shadow-md shadow-orange-500/20">
              <Package className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h3 className="text-xl font-black text-gray-950 dark:text-white uppercase tracking-tight">
              {product ? 'Edit Product' : 'Add New Product'}
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 sm:p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                <Tag className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.5]" /> Product Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Coca-Cola 1.5L"
                className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" /> Cost (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  <Coins className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.5]" /> Price (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                />
              </div>
            </div>

            {/* Weight-Based Product Toggle */}
            <div className="bg-orange-50 dark:bg-orange-950/30 p-4 rounded-2xl border-2 border-orange-200 dark:border-orange-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-500 text-white rounded-xl shadow-xs">
                  <Scale className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase text-gray-950 dark:text-white tracking-wider">
                    Weight-Based Item (Timbangan)
                  </h4>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">
                    Sold by kg, g, or decimal quantities (e.g. bigas, karne, gulay)
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={formData.isWeightBased}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData(prev => ({
                      ...prev,
                      isWeightBased: checked,
                      unit: checked && prev.unit === 'pc' ? 'kg' : (!checked && prev.unit === 'kg' ? 'pc' : prev.unit)
                    }));
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-600"></div>
                <span className="ml-2.5 text-xs font-black uppercase text-gray-900 dark:text-white">
                  {formData.isWeightBased ? 'Weight-Based' : 'Standard'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider">
                    Category *
                  </label>
                  {!isAddingNewCategory && (
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCategory(true)}
                      className="text-[10px] font-black uppercase text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                    >
                      + New
                    </button>
                  )}
                </div>

                {isAddingNewCategory ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Type category..."
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-xl border-2 border-orange-500 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const trimmed = newCatName.trim();
                        if (trimmed) {
                          try {
                            await addCategory(trimmed);
                          } catch {}
                          setFormData(prev => ({ ...prev, category: trimmed }));
                          setNewCatName('');
                          setIsAddingNewCategory(false);
                        }
                      }}
                      className="px-2.5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black transition-colors"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewCategory(false);
                        setNewCatName('');
                      }}
                      className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === '__ADD_NEW__') {
                        setIsAddingNewCategory(true);
                      } else {
                        setFormData({ ...formData, category: e.target.value });
                      }
                    }}
                    className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all cursor-pointer shadow-xs"
                  >
                    <option value="">Select...</option>
                    {categories.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    {formData.category && !categories.some(c => c.name.toLowerCase() === formData.category.toLowerCase()) && (
                      <option value={formData.category}>{formData.category}</option>
                    )}
                    <option value="__ADD_NEW__">+ Add Custom Category...</option>
                  </select>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  <Scale className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 stroke-[2.5]" /> Unit of Measure *
                </label>
                <select
                  required
                  value={formData.unit}
                  onChange={(e) => {
                    const u = e.target.value;
                    setFormData({ 
                      ...formData, 
                      unit: u,
                      isWeightBased: u === 'kg' || u === 'g' ? true : formData.isWeightBased
                    });
                  }}
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all cursor-pointer shadow-xs"
                >
                  <option value="pc">Piece (pc)</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="g">Gram (g)</option>
                  <option value="pack">Pack / Pouch</option>
                  <option value="liter">Liter (L)</option>
                  <option value="meter">Meter (m)</option>
                  <option value="box">Box</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 stroke-[2.5]" /> Branch *
                </label>
                <select
                  required
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all cursor-pointer shadow-xs"
                >
                  <option value="">Select Branch...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 stroke-[2.5]" /> Stock ({formData.unit || 'qty'}) *
                </label>
                <input
                  type="number"
                  step={formData.isWeightBased ? "any" : "1"}
                  required
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder={formData.isWeightBased ? "e.g. 50.5" : "0"}
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2.5]" /> Min Stock Alert
                </label>
                <input
                  type="number"
                  step={formData.isWeightBased ? "any" : "1"}
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  placeholder={formData.isWeightBased ? "e.g. 5.0" : "e.g. 10"}
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5">
                  Barcode (Optional)
                </label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="Scan or type..."
                  className="w-full px-4 py-3 sm:py-3.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-950 dark:text-white font-bold text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-[2] bg-orange-600 hover:bg-orange-700 text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all text-xs uppercase tracking-wider cursor-pointer"
            >
              {isSaving ? (
                <span className="animate-spin border-2 border-white/30 border-t-white rounded-full w-5 h-5" />
              ) : (
                <>
                  <Save className="w-5 h-5 stroke-[2.5]" />
                  <span>{product ? 'Update Product' : 'Save Product'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
