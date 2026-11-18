import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {
  SUPABASE_TABLE_EXPORTS,
  serializeTableToSupabaseCsv,
  buildSupabaseImportReadme,
  createZipBytes,
} from '../src/lib/utils/supabase-csv-export';

test('SUPABASE_TABLE_EXPORTS covers all 14 tables in FK-safe upload order', () => {
  assert.equal(SUPABASE_TABLE_EXPORTS.length, 14);
  assert.deepEqual(
    SUPABASE_TABLE_EXPORTS.map((s) => s.tableName),
    [
      'store_info',
      'branches',
      'users',
      'categories',
      'products',
      'customers',
      'suppliers',
      'transactions',
      'credit_log',
      'ewallet_transactions',
      'restock_transactions',
      'expenses',
      'audit_logs',
      'metadata',
    ]
  );
});

test('serializeTableToSupabaseCsv maps snake_case columns, JSONB strings, and omits firebaseSecret', () => {
  const storeSpec = SUPABASE_TABLE_EXPORTS.find((s) => s.tableName === 'store_info')!;
  const storeCsv = serializeTableToSupabaseCsv(storeSpec, [
    {
      id: 'main_store',
      name: 'Tindahan ni Aling Nena',
      currency: 'PHP',
      taxType: 'NON-VAT',
      vatRate: 12,
      lastORNumber: 42,
      firebaseSecret: 'SUPER_SECRET_SHOULD_NOT_EXPORT',
      receiptSettings: { paperWidth: '58mm', showTin: true },
      updatedAt: 1700000000000,
      isDeleted: false,
    },
  ]);

  assert.ok(!storeCsv.includes('SUPER_SECRET_SHOULD_NOT_EXPORT'));
  const parsed = Papa.parse<Record<string, string>>(storeCsv, { header: true });
  assert.equal(parsed.data.length, 1);
  assert.equal(parsed.data[0].id, 'main_store');
  assert.equal(parsed.data[0].last_or_number, '42');
  assert.equal(parsed.data[0].tax_type, 'NON-VAT');
  assert.deepEqual(JSON.parse(parsed.data[0].receipt_settings), {
    paperWidth: '58mm',
    showTin: true,
  });
});

test('serializeTableToSupabaseCsv emits valid headers even for empty tables and sorts credit_log parent rows first', () => {
  const productsSpec = SUPABASE_TABLE_EXPORTS.find((s) => s.tableName === 'products')!;
  const emptyCsv = serializeTableToSupabaseCsv(productsSpec, []);
  assert.equal(emptyCsv.trim(), productsSpec.columns.join(','));

  const creditSpec = SUPABASE_TABLE_EXPORTS.find((s) => s.tableName === 'credit_log')!;
  const creditCsv = serializeTableToSupabaseCsv(creditSpec, [
    {
      id: 'pay-1',
      customerId: 'cust-1',
      branchId: 'main_branch',
      amount: -50,
      type: 'payment',
      description: 'Partial',
      targetCreditId: 'cred-1',
      timestamp: 2000,
      updatedAt: 2000,
    },
    {
      id: 'cred-1',
      customerId: 'cust-1',
      branchId: 'main_branch',
      amount: 100,
      type: 'credit',
      description: 'Bigas',
      timestamp: 1000,
      updatedAt: 1000,
    },
  ]);

  const parsedCredit = Papa.parse<Record<string, string>>(creditCsv, { header: true });
  assert.equal(parsedCredit.data[0].id, 'cred-1');
  assert.equal(parsedCredit.data[1].id, 'pay-1');
  assert.equal(parsedCredit.data[1].target_credit_id, 'cred-1');
});

test('serializeTableToSupabaseCsv never emits empty strings for typed numeric, bigint, jsonb, or tax_type columns', () => {
  const txnSpec = SUPABASE_TABLE_EXPORTS.find((s) => s.tableName === 'transactions')!;
  const txnCsv = serializeTableToSupabaseCsv(txnSpec, [
    {
      id: '',
      ticketNumber: 'T-0001',
      orNumber: 'OR-0001',
      items: undefined,
      total: 100,
      vatableSales: undefined,
      vatAmount: null,
      taxType: '',
      amountPaid: undefined,
      change: null,
      paymentDetails: undefined,
    },
  ]);

  const parsed = Papa.parse<Record<string, string>>(txnCsv, { header: true });
  const row = parsed.data[0];
  assert.ok(row.id.length > 0);
  assert.equal(row.vatable_sales, '0');
  assert.equal(row.vat_amount, '0');
  assert.equal(row.amount_paid, '0');
  assert.equal(row.change, '0');
  assert.equal(row.tax_type, 'NON-VAT');
  assert.equal(row.payment_details, '{}');
  assert.equal(row.items, '[]');
});

test('createZipBytes produces valid PKZIP archive containing README and CSV entries', () => {
  const readme = buildSupabaseImportReadme({ store_info: 1 });
  const zip = createZipBytes([
    { name: 'README_SUPABASE_IMPORT.txt', content: readme },
    { name: '01_store_info.csv', content: 'id,name\nmain_store,Test' },
  ]);

  // Verify PKZIP local file header signature (0x50 0x4b 0x03 0x04) and EOCD (0x50 0x4b 0x05 0x06)
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
  const eocdOffset = zip.length - 22;
  assert.equal(zip[eocdOffset], 0x50);
  assert.equal(zip[eocdOffset + 1], 0x4b);
  assert.equal(zip[eocdOffset + 2], 0x05);
  assert.equal(zip[eocdOffset + 3], 0x06);
});
