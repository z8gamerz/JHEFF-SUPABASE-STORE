/**
 * Deterministic Financial, Tax, Weight-Quantity & Split-Payment Utilities
 * Centralizes currency (2-decimal) and fractional weight (3-decimal) rounding
 * across POS checkout, reports, sales journal, and credit ledger matching.
 */

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number, isWeightBased: boolean = false): number {
  if (!Number.isFinite(value)) return 0;
  if (isWeightBased) {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }
  return Math.round(value);
}

export interface VatBreakdown {
  total: number;
  vatableSales: number;
  vatAmount: number;
  taxType: 'VAT' | 'NON-VAT';
}

export function computeVatBreakdown(
  grossTotal: number,
  taxType: 'VAT' | 'NON-VAT' = 'NON-VAT',
  vatRatePercent: number = 12
): VatBreakdown {
  const total = roundCurrency(Math.max(0, grossTotal));
  if (taxType !== 'VAT' || vatRatePercent <= 0) {
    return {
      total,
      vatableSales: total,
      vatAmount: 0,
      taxType: 'NON-VAT',
    };
  }

  const rate = vatRatePercent / 100;
  const vatableSales = roundCurrency(total / (1 + rate));
  const vatAmount = roundCurrency(total - vatableSales);

  return {
    total,
    vatableSales,
    vatAmount,
    taxType: 'VAT',
  };
}

export function computeLineTotal(price: number, quantity: number, isWeightBased: boolean = false): number {
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const safeQty = roundQuantity(Math.max(0, quantity), isWeightBased);
  return roundCurrency(safePrice * safeQty);
}

export function computeLineProfit(
  price: number,
  costPrice: number,
  quantity: number,
  isWeightBased: boolean = false
): number {
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const safeCost = Number.isFinite(costPrice) ? Math.max(0, costPrice) : 0;
  const safeQty = roundQuantity(Math.max(0, quantity), isWeightBased);
  return roundCurrency((safePrice - safeCost) * safeQty);
}

export function computeRemainingStock(
  currentStock: number,
  soldQuantity: number,
  isWeightBased: boolean = false
): number {
  const next = Math.max(0, (Number(currentStock) || 0) - (Number(soldQuantity) || 0));
  return roundQuantity(next, isWeightBased);
}

export interface SplitPortion {
  method: string;
  amount: number;
  customerId?: string;
}

export function validateSplitBreakdown(
  total: number,
  portions: SplitPortion[]
): { valid: boolean; remaining: number; error?: string } {
  const normalizedTotal = roundCurrency(total);
  const sum = roundCurrency(
    portions.reduce((acc, p) => acc + (Number.isFinite(p.amount) ? Math.max(0, p.amount) : 0), 0)
  );
  const remaining = roundCurrency(normalizedTotal - sum);

  if (Math.abs(remaining) > 0.01) {
    return {
      valid: false,
      remaining,
      error: `Split total must equal ₱${normalizedTotal.toFixed(2)}. Currently remaining: ₱${remaining.toFixed(2)}`,
    };
  }

  for (const portion of portions) {
    if (portion.method === 'credit' && portion.amount > 0 && !portion.customerId) {
      return {
        valid: false,
        remaining: 0,
        error: 'Please select a customer for the credit portion in split payment.',
      };
    }
  }

  return { valid: true, remaining: 0 };
}
