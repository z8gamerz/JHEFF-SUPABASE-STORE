'use client';

import { useState, useCallback } from 'react';
import { Product, TransactionItem } from '@/lib/db/idb';
import { roundCurrency, roundQuantity } from '@/lib/utils/financial';

export function useCart() {
  const [cart, setCart] = useState<TransactionItem[]>([]);

  const addToCart = useCallback((product: Product) => {
    if (!product.id) return;
    
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: roundQuantity(item.quantity + 1, Boolean(item.isWeightBased)) }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          costPrice: product.cost || 0,
          quantity: 1,
          unit: product.unit || (product.isWeightBased ? 'kg' : 'pc'),
          isWeightBased: Boolean(product.isWeightBased),
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const nextQty = roundQuantity(Math.max(0, item.quantity + delta), Boolean(item.isWeightBased));
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const setItemQuantity = useCallback((productId: string, quantity: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: roundQuantity(Math.max(0, quantity), Boolean(item.isWeightBased)),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const total = roundCurrency(
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    setItemQuantity,
    clearCart,
    total,
  };
}
