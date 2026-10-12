'use client';

import { useState } from 'react';
import { Supplier } from '@/lib/db/idb';
import { X, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SupplierFormProps {
  supplier?: Supplier | null;
  onSave: (data: any) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function SupplierForm({ supplier, onSave, onDelete, onClose }: SupplierFormProps) {
  const [formData, setFormData] = useState({
    name: supplier?.name || '',
    contactPerson: supplier?.contactPerson || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border-2 border-gray-200 dark:border-gray-800 transition-colors"
      >
        <div className="p-6 sm:p-8 border-b-2 border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-850">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-gray-950 dark:text-white tracking-tight">
              {supplier ? 'Edit Supplier' : 'Add New Supplier'}
            </h3>
            <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 font-bold">
              Enter supplier contact details
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 sm:p-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5 ml-1">
                Supplier Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-5 py-3 text-gray-950 dark:text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                placeholder="e.g. Coca-Cola Philippines"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5 ml-1">
                Contact Person
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-5 py-3 text-gray-950 dark:text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                placeholder="Name of your contact"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5 ml-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-5 py-3 text-gray-950 dark:text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                  placeholder="0917..."
                />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5 ml-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-5 py-3 text-gray-950 dark:text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                  placeholder="supplier@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-950 dark:text-gray-100 uppercase tracking-wider mb-1.5 ml-1">
                Address
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-2xl px-5 py-3 text-gray-950 dark:text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 outline-none transition-all resize-none placeholder:text-gray-500 dark:placeholder:text-gray-400 shadow-xs"
                rows={2}
                placeholder="Supplier office address"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-3">
            {supplier && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(supplier.id)}
                className="flex-1 bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-black py-3.5 rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-all flex items-center justify-center gap-2 border-2 border-rose-300 dark:border-rose-800 cursor-pointer text-xs uppercase tracking-wider"
              >
                <Trash2 className="w-4 h-4 stroke-[2.5]" />
                Delete
              </button>
            )}
            <button
              type="submit"
              className="flex-[2] bg-indigo-600 text-white font-black py-3.5 rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              {supplier ? 'Update Supplier' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
