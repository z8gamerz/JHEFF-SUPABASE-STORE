import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundCurrency,
  roundQuantity,
  computeVatBreakdown,
  computeLineTotal,
  computeLineProfit,
  computeRemainingStock,
  validateSplitBreakdown,
} from '../src/lib/utils/financial.ts';

test('roundCurrency handles floating-point drift and non-finite inputs deterministically', () => {
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);
  assert.equal(roundCurrency(19.995), 20);
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundCurrency(123.454), 123.45);
  assert.equal(roundCurrency(NaN), 0);
  assert.equal(roundCurrency(Infinity), 0);
});

test('roundQuantity rounds standard units to integers and weight-based units to 3 decimals', () => {
  assert.equal(roundQuantity(2.6, false), 3);
  assert.equal(roundQuantity(2.4, false), 2);
  assert.equal(roundQuantity(1.2345, true), 1.235);
  assert.equal(roundQuantity(0.1 + 0.2, true), 0.3);
  assert.equal(roundQuantity(NaN, true), 0);
});

test('computeVatBreakdown calculates 12% VAT-inclusive breakdown accurately', () => {
  const vat = computeVatBreakdown(112, 'VAT', 12);
  assert.equal(vat.taxType, 'VAT');
  assert.equal(vat.total, 112);
  assert.equal(vat.vatableSales, 100);
  assert.equal(vat.vatAmount, 12);

  // Sum of vatableSales + vatAmount always equals total
  const oddVat = computeVatBreakdown(123.45, 'VAT', 12);
  assert.equal(roundCurrency(oddVat.vatableSales + oddVat.vatAmount), oddVat.total);
});

test('computeVatBreakdown keeps zero VAT for NON-VAT and handles zero/negative totals', () => {
  const nonVat = computeVatBreakdown(250.75, 'NON-VAT', 12);
  assert.equal(nonVat.taxType, 'NON-VAT');
  assert.equal(nonVat.total, 250.75);
  assert.equal(nonVat.vatableSales, 250.75);
  assert.equal(nonVat.vatAmount, 0);

  const zeroed = computeVatBreakdown(-50, 'VAT', 12);
  assert.equal(zeroed.total, 0);
  assert.equal(zeroed.vatableSales, 0);
  assert.equal(zeroed.vatAmount, 0);
});

test('computeLineTotal and computeLineProfit preserve centavo accuracy for weight-based items', () => {
  assert.equal(computeLineTotal(55.5, 1.35, true), 74.93);
  assert.equal(computeLineProfit(55.5, 42.25, 1.35, true), 17.89);
  assert.equal(computeLineTotal(15, 3, false), 45);
  assert.equal(computeLineProfit(15, 11.5, 3, false), 10.5);
});

test('computeRemainingStock subtracts decimal weight quantities cleanly and clamps at zero', () => {
  assert.equal(computeRemainingStock(10.5, 0.355, true), 10.145);
  assert.equal(computeRemainingStock(5, 2, false), 3);
  assert.equal(computeRemainingStock(1.2, 5, true), 0);
});

test('validateSplitBreakdown enforces exact balance within centavo tolerance and credit customer requirement', () => {
  const valid = validateSplitBreakdown(150.25, [
    { method: 'cash', amount: 100.25 },
    { method: 'gcash', amount: 50 },
  ]);
  assert.equal(valid.valid, true);
  assert.equal(valid.remaining, 0);

  const mismatch = validateSplitBreakdown(150.25, [
    { method: 'cash', amount: 100 },
    { method: 'gcash', amount: 40 },
  ]);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.remaining, 10.25);
  assert.match(mismatch.error || '', /10\.25/);

  const missingCustomer = validateSplitBreakdown(150, [
    { method: 'cash', amount: 100 },
    { method: 'credit', amount: 50 },
  ]);
  assert.equal(missingCustomer.valid, false);
  assert.match(missingCustomer.error || '', /select a customer/i);

  const validWithCustomer = validateSplitBreakdown(150, [
    { method: 'cash', amount: 100 },
    { method: 'credit', amount: 50, customerId: 'cust-1' },
  ]);
  assert.equal(validWithCustomer.valid, true);
});
