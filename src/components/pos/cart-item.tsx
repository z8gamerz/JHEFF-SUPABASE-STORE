'use client';

import React, { useState, useEffect } from 'react';
import { TransactionItem } from '@/lib/db/idb';
import { Plus, Minus, Trash2, Scale } from 'lucide-react';

interface CartItemProps {
  item: TransactionItem;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onSetQuantity?: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export const CartItem = React.memo(function CartItem({ 
  item, 
  onUpdateQuantity, 
  onSetQuantity, 
  onRemove 
}: CartItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(item.quantity));

  useEffect(() => {
    setInputValue(String(item.quantity));
  }, [item.quantity]);

  const commitValue = () => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed > 0) {
      const rounded = Math.round(parsed * 1000) / 1000;
      if (onSetQuantity) {
        onSetQuantity(item.productId, rounded);
      } else {
        const delta = rounded - item.quantity;
        if (delta !== 0) onUpdateQuantity(item.productId, delta);
      }
    } else if (parsed === 0) {
      onRemove(item.productId);
    } else {
      setInputValue(String(item.quantity));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue();
    } else if (e.key === 'Escape') {
      setInputValue(String(item.quantity));
      setIsEditing(false);
    }
  };

  // Delta step: 0.5 for weight-based, 1 for standard
  const stepDelta = item.isWeightBased ? 0.5 : 1;

  return (
    <div className="flex items-center gap-3 sm:gap-4 p-4 bg-white dark:bg-gray-900 rounded-[2rem] border-2 border-gray-200 dark:border-gray-800 shadow-xs hover:shadow-md transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h5 className="font-black text-gray-950 dark:text-white truncate text-base sm:text-lg tracking-tight leading-tight">
            {item.name}
          </h5>
          {item.isWeightBased && (
            <span className="bg-amber-100 dark:bg-amber-950/80 text-amber-950 dark:text-amber-200 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md border border-amber-300 dark:border-amber-800 flex items-center gap-0.5 shrink-0">
              <Scale className="w-2.5 h-2.5 stroke-[2.5]" />
              <span>{item.unit || 'KG'}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-black text-gray-700 dark:text-gray-300">
            ₱{item.price.toFixed(2)} / {item.unit || 'pc'}
          </span>
          <span className="text-xs font-black text-orange-950 dark:text-orange-200 bg-orange-100 dark:bg-orange-950/90 px-2.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
            ₱{(item.price * item.quantity).toFixed(2)}
          </span>
        </div>
      </div>
      
      {/* Adjustable Quantity Stepper & Direct Numeric Input */}
      <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 border-2 border-gray-200 dark:border-gray-700">
        <button 
          type="button"
          onClick={() => onUpdateQuantity(item.productId, -stepDelta)}
          className="p-1.5 sm:p-2 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs rounded-xl transition-all active:scale-90 text-gray-900 dark:text-white font-black cursor-pointer"
          title={`Decrease quantity (-${stepDelta})`}
        >
          <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
        </button>

        {isEditing ? (
          <input
            type="number"
            step="any"
            min="0.001"
            max="9999"
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            className="w-14 sm:w-16 text-center font-black text-gray-950 dark:text-white bg-white dark:bg-gray-900 border-2 border-orange-500 rounded-lg py-0.5 text-sm sm:text-base outline-none shadow-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="min-w-10 sm:min-w-12 px-1 text-center font-black text-gray-950 dark:text-white text-sm sm:text-base hover:text-orange-600 dark:hover:text-orange-400 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-lg transition-colors cursor-pointer py-0.5"
            title="Click to type exact weight or quantity"
          >
            {item.quantity} {item.unit && item.unit !== 'pc' ? item.unit : ''}
          </button>
        )}

        <button 
          type="button"
          onClick={() => onUpdateQuantity(item.productId, stepDelta)}
          className="p-1.5 sm:p-2 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs rounded-xl transition-all active:scale-90 text-gray-900 dark:text-white font-black cursor-pointer"
          title={`Increase quantity (+${stepDelta})`}
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
        </button>
      </div>
      
      <button 
        type="button"
        onClick={() => onRemove(item.productId)}
        className="p-2 sm:p-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/80 rounded-2xl transition-all active:scale-90 cursor-pointer shrink-0"
        title="Remove item"
      >
        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    </div>
  );
});

