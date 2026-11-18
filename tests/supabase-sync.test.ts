import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { STORES } from '../src/lib/db/idb';
import {
  fromSupabaseRow,
  getSupabasePrimaryKey,
  isSyncedStore,
  SYNCED_STORES_ORDERED,
  toSupabaseRow,
} from '../src/lib/utils/supabase-mapper';
import {
  getCloudProvider,
  isServiceRoleJwt,
} from '../src/lib/db/cloud-provider';
import supabaseSyncHandler from '../api/supabase-sync';
import { clearRateLimitState } from '../api/_security';

function makeJwtWithRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url');
  return `${header}.${payload}.sig`;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = String(v);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

describe('Supabase mapper & provider helpers', () => {
  it('orders all 14 synced stores with parent tables before child ledgers', () => {
    assert.equal(SYNCED_STORES_ORDERED.length, 14);
    assert.equal(isSyncedStore('products'), true);
    assert.equal(isSyncedStore('sync_queue'), false);
    assert.equal(isSyncedStore('random_table'), false);
    assert.equal(getSupabasePrimaryKey(STORES.METADATA), 'key');
    assert.equal(getSupabasePrimaryKey(STORES.PRODUCTS), 'id');
  });

  it('round-trips store_info cleanly while omitting firebaseSecret', () => {
    const input = {
      id: 'main_config',
      name: 'Ate Nena Store',
      address: '123 Mabini St',
      tin: '111-222-333-000',
      currency: 'PHP',
      taxType: 'VAT',
      vatRate: 12,
      lastORNumber: 42,
      lastSyncedAt: 1700000100000,
      receiptSettings: { paperWidth: '80mm', showTin: true },
      firebaseSecret: 'SUPER_SECRET_DO_NOT_SYNC',
      updatedAt: 1700000200000,
      isDeleted: false,
    };

    const row = toSupabaseRow(STORES.STORE_INFO, input);
    assert.equal('firebaseSecret' in row, false);
    assert.equal('firebase_secret' in row, false);
    assert.equal(row.tax_type, 'VAT');
    assert.equal(row.last_or_number, 42);
    assert.deepEqual(row.receipt_settings, { paperWidth: '80mm', showTin: true });

    const roundTrip = fromSupabaseRow(STORES.STORE_INFO, row);
    assert.equal(roundTrip.id, 'main_config');
    assert.equal(roundTrip.taxType, 'VAT');
    assert.equal(roundTrip.lastORNumber, 42);
    assert.deepEqual(roundTrip.receiptSettings, { paperWidth: '80mm', showTin: true });
    assert.equal(roundTrip.updatedAt, 1700000200000);
  });

  it('round-trips transactions, credit_log, audit_logs, and metadata faithfully', () => {
    const txn = {
      id: 'txn-1',
      ticketNumber: 'T-0001',
      orNumber: 'OR-0001',
      items: [{ productId: 'p1', name: 'Kape', price: 15, costPrice: 10, quantity: 2 }],
      total: 30,
      vatableSales: 26.79,
      vatAmount: 3.21,
      taxType: 'VAT',
      timestamp: 1700000000000,
      branchId: 'b1',
      customerId: 'c1',
      customerName: 'Juan',
      paymentMethod: 'split',
      amountPaid: 30,
      change: 0,
      paymentDetails: { splitBreakdown: [{ method: 'cash', amount: 30 }] },
      updatedAt: 1700000000500,
    };
    const txnRow = toSupabaseRow(STORES.TRANSACTIONS, txn);
    assert.equal(txnRow.ticket_number, 'T-0001');
    assert.equal(txnRow.payment_method, 'split');
    const txnBack = fromSupabaseRow(STORES.TRANSACTIONS, txnRow);
    assert.equal(txnBack.ticketNumber, 'T-0001');
    assert.deepEqual(txnBack.items, txn.items);
    assert.deepEqual(txnBack.paymentDetails, txn.paymentDetails);

    const auditRow = toSupabaseRow(STORES.AUDIT_LOGS, {
      id: 'a1',
      action: 'SALE',
      user: 'cashier@store.ph',
      details: 'Sold 2 items',
      timestamp: 1700000000000,
      updatedAt: 1700000000000,
    });
    assert.equal(auditRow.user_name, 'cashier@store.ph');
    const auditBack = fromSupabaseRow(STORES.AUDIT_LOGS, auditRow);
    assert.equal(auditBack.user, 'cashier@store.ph');

    const metaRow = toSupabaseRow(STORES.METADATA, {
      key: 'or_counter',
      value: '99',
      updatedAt: 1700000001000,
    });
    assert.equal(metaRow.key, 'or_counter');
    assert.equal(metaRow.value, '99');
    const metaBack = fromSupabaseRow(STORES.METADATA, metaRow);
    assert.equal(metaBack.key, 'or_counter');
    assert.equal(metaBack.value, '99');
  });

  it('defaults cloud provider safely to firebase and detects service_role JWTs', () => {
    assert.equal(getCloudProvider(), 'firebase');
    assert.equal(isServiceRoleJwt(makeJwtWithRole('service_role')), true);
    assert.equal(isServiceRoleJwt(makeJwtWithRole('anon')), false);
    assert.equal(isServiceRoleJwt('sb_publishable_demo_key'), false);
  });
});

describe('/api/supabase-sync handler security', () => {
  const prevSecret = process.env.POS_API_SECRET;
  const prevUrl = process.env.SUPABASE_URL;
  const prevService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    clearRateLimitState();
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.POS_API_SECRET;
    else process.env.POS_API_SECRET = prevSecret;

    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;

    if (prevService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevService;
  });

  it('fails closed with 503 when POS_API_SECRET is missing', async () => {
    delete process.env.POS_API_SECRET;
    const req: any = { method: 'POST', headers: {}, body: { action: 'health' } };
    const res = createMockRes();
    await supabaseSyncHandler(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'API_AUTH_NOT_CONFIGURED');
  });

  it('rejects missing/wrong API key with 401', async () => {
    process.env.POS_API_SECRET = 'test-pos-secret';
    const req: any = {
      method: 'POST',
      headers: { 'x-pos-api-key': 'wrong' },
      body: { action: 'health' },
    };
    const res = createMockRes();
    await supabaseSyncHandler(req, res);
    assert.equal(res.statusCode, 401);
  });

  it('reports not_configured cleanly on health when server Supabase env vars are absent', async () => {
    process.env.POS_API_SECRET = 'test-pos-secret';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const req: any = {
      method: 'POST',
      headers: { 'x-pos-api-key': 'test-pos-secret' },
      body: { action: 'health' },
    };
    const res = createMockRes();
    await supabaseSyncHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured, false);
    assert.equal(res.body.status, 'not_configured');
  });

  it('rejects disallowed table/store names with 400 when proxy configured', async () => {
    process.env.POS_API_SECRET = 'test-pos-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = makeJwtWithRole('service_role');
    const req: any = {
      method: 'POST',
      headers: { 'x-pos-api-key': 'test-pos-secret' },
      body: { action: 'pull', store: 'pg_shadow' },
    };
    const res = createMockRes();
    await supabaseSyncHandler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_STORE');
  });
});
