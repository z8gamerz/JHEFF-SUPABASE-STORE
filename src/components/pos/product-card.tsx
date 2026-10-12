'use client';

import React, { useMemo } from 'react';
import { Product } from '@/lib/db/idb';
import { Plus } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
}

export const ProductCard = React.memo(function ProductCard({ product, onAdd }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0;

  // Format price
  const formattedPrice = product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  // Auto-fit font size based on price text length
  const priceFontSize = useMemo(() => {
    const len = formattedPrice.length;
    if (len > 10) return 'text-base sm:text-lg md:text-xl';
    if (len > 7) return 'text-lg sm:text-xl md:text-2xl';
    return 'text-xl sm:text-2xl';
  }, [formattedPrice]);

  return (
    <button
      disabled={isOutOfStock}
      onClick={() => onAdd(product)}
      className={`group relative bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-2xl sm:rounded-[2rem] border-2 border-gray-200 dark:border-gray-800 hover:border-orange-500 dark:hover:border-orange-500 shadow-xs hover:shadow-md transition-all text-left flex flex-col justify-between h-full min-w-0 w-full overflow-hidden transform-gpu ${
        isOutOfStock 
          ? 'opacity-50 grayscale cursor-not-allowed' 
          : 'active:scale-95 active:bg-orange-50/50 dark:active:bg-orange-950/30 cursor-pointer'
      }`}
    >
      <div className="flex-1 min-w-0 w-full">
        {/* Badges container with auto-fit flex */}
        <div className="flex items-center justify-between mb-2 gap-1.5 min-w-0">
          <span 
            title={product.category}
            className="text-[9px] sm:text-[10px] font-black text-orange-950 dark:text-orange-200 uppercase tracking-wider bg-orange-100 dark:bg-orange-950/90 px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border border-orange-300 dark:border-orange-800 truncate max-w-[95px] sm:max-w-[120px] shrink"
          >
            {product.category}
          </span>
          <span className={`text-[9px] sm:text-[10px] font-black px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border shrink-0 ${
            product.stock > 10 
              ? 'bg-emerald-100 dark:bg-emerald-950/90 text-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800' 
              : 'bg-rose-100 dark:bg-rose-950/90 text-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
          }`}>
            {product.stock} IN STOCK
          </span>
        </div>
        
        {/* Product title with auto-fit responsive typography and line clamp */}
        <h4 
          title={product.name}
          className="font-black text-gray-950 dark:text-white line-clamp-2 text-xs sm:text-sm md:text-base leading-snug mb-1 min-w-0 break-words"
        >
          {product.name}
        </h4>
        
        {/* Auto-fit price display */}
        <div className="flex items-baseline gap-1 mt-2 min-w-0">
          <span className="text-xs sm:text-sm font-black text-gray-800 dark:text-gray-200 shrink-0">₱</span>
          <span className={`${priceFontSize} font-black text-gray-950 dark:text-white tracking-tight truncate min-w-0`}>
            {formattedPrice}
          </span>
        </div>
      </div>

      <div className="mt-3 sm:mt-4 flex items-center justify-between w-full min-w-0">
        <div className="w-full bg-gray-950 dark:bg-gray-800 text-white py-2.5 sm:py-3 px-2 rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 font-black text-[11px] sm:text-xs tracking-wider uppercase group-hover:bg-orange-600 dark:group-hover:bg-orange-600 transition-colors pointer-events-none shadow-xs truncate">
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3] shrink-0" />
          <span className="truncate">ADD TO CART</span>
        </div>
      </div>
    </button>
  );
});
