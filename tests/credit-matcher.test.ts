import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCreditCrossMatch, previewPaymentImpact } from '../src/lib/utils/credit-matcher.ts';
import type { CreditEntry } from '../src/lib/db/idb.ts';

function makeEntry(overrides: Partial<CreditEntry> & Pick<CreditEntry, 'id' | 'type' | 'amount' | 'timestamp'>): CreditEntry {
  return {
    customerId: 'cust-1',
    branchId: 'branch-1',
    description: overrides.type === 'credit' ? 'Utang purchase' : 'Bayad',
    updatedAt: overrides.timestamp,
    ...overrides,
  };
}

test('computeCreditCrossMatch applies FIFO settlement chronologically without floating-point drift', () => {
  const entries: CreditEntry[] = [
    makeEntry({ id: 'c2', type: 'credit', amount: 45.2, timestamp: 2000, description: 'Rice & Sardines' }),
    makeEntry({ id: 'c1', type: 'credit', amount: 30.1, timestamp: 1000, description: 'Coffee & Sugar' }),
    makeEntry({ id: 'p1', type: 'payment', amount: -50.15, timestamp: 3000, description: 'Partial Bayad' }),
  ];

  const result = computeCreditCrossMatch(entries);

  assert.equal(result.summary.totalCredits, 75.3);
  assert.equal(result.summary.totalPayments, 50.15);
  assert.equal(result.summary.totalOutstanding, 25.15);
  assert.equal(result.summary.totalSettledCredits, 1);
  assert.equal(result.summary.totalPartialCredits, 1);
  assert.equal(result.summary.totalUnpaidCredits, 0);

  const first = result.credits.find((c) => c.id === 'c1')!;
  assert.equal(first.status, 'fully_paid');
  assert.equal(first.amountPaid, 30.1);
  assert.equal(first.remainingBalance, 0);
  assert.equal(first.settledAt, 3000);

  const second = result.credits.find((c) => c.id === 'c2')!;
  assert.equal(second.status, 'partially_paid');
  assert.equal(second.amountPaid, 20.05);
  assert.equal(second.remainingBalance, 25.15);
  assert.equal(second.settledAt, undefined);
});

test('computeCreditCrossMatch prioritizes explicit targetCreditId before FIFO overflow', () => {
  const entries: CreditEntry[] = [
    makeEntry({ id: 'c1', type: 'credit', amount: 100, timestamp: 1000, description: 'Old Utang' }),
    makeEntry({ id: 'c2', type: 'credit', amount: 60, timestamp: 2000, description: 'New Utang' }),
    makeEntry({
      id: 'p1',
      type: 'payment',
      amount: -80,
      timestamp: 3000,
      targetCreditId: 'c2',
      description: 'Pay new utang first',
    }),
  ];

  const result = computeCreditCrossMatch(entries);
  const c1 = result.credits.find((c) => c.id === 'c1')!;
  const c2 = result.credits.find((c) => c.id === 'c2')!;

  assert.equal(c2.status, 'fully_paid');
  assert.equal(c2.amountPaid, 60);
  assert.equal(c1.status, 'partially_paid');
  assert.equal(c1.amountPaid, 20);
  assert.equal(c1.remainingBalance, 80);
  assert.equal(result.summary.totalOutstanding, 80);
});

test('computeCreditCrossMatch captures overpayment unallocatedAmount and excludes soft-deleted entries', () => {
  const entries: CreditEntry[] = [
    makeEntry({ id: 'c1', type: 'credit', amount: 50, timestamp: 1000 }),
    makeEntry({ id: 'c-del', type: 'credit', amount: 500, timestamp: 1200, isDeleted: true }),
    makeEntry({ id: 'p-del', type: 'payment', amount: -200, timestamp: 1500, isDeleted: true }),
    makeEntry({ id: 'p1', type: 'payment', amount: -75.25, timestamp: 2000 }),
  ];

  const result = computeCreditCrossMatch(entries);
  assert.equal(result.credits.length, 1);
  assert.equal(result.payments.length, 1);
  assert.equal(result.summary.totalCredits, 50);
  assert.equal(result.summary.totalPayments, 75.25);
  assert.equal(result.summary.totalOutstanding, 0);
  assert.equal(result.payments[0].unallocatedAmount, 25.25);
});

test('previewPaymentImpact forecasts settlement impact without mutating original credit list', () => {
  const initial = computeCreditCrossMatch([
    makeEntry({ id: 'c1', type: 'credit', amount: 40.5, timestamp: 1000, description: 'Item A' }),
    makeEntry({ id: 'c2', type: 'credit', amount: 59.5, timestamp: 2000, description: 'Item B' }),
  ]);

  const preview = previewPaymentImpact(initial.credits, 120, 'c2');
  assert.equal(preview.totalCovered, 100);
  assert.equal(preview.unallocated, 20);
  assert.equal(preview.impacts[0].creditId, 'c2');
  assert.equal(preview.impacts[0].willBeFullySettled, true);
  assert.equal(preview.impacts[1].creditId, 'c1');
  assert.equal(preview.impacts[1].willBeFullySettled, true);

  // Original array must remain unmutated
  assert.equal(initial.credits[0].remainingBalance, 40.5);
  assert.equal(initial.credits[1].remainingBalance, 59.5);
});
