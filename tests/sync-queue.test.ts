import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { dbUtil, STORES, type SyncAction } from '../src/lib/db/idb.ts';
import {
  MAX_RETRIES,
  MAX_BACKOFF_MS,
  computeNextRetryDelayMs,
  isActionDueForSync,
  computeFailedActionUpdate,
  queueAction,
  processQueue,
} from '../src/lib/db/sync-queue.ts';

const originalDbMethods = {
  addItem: dbUtil.addItem.bind(dbUtil),
  getItems: dbUtil.getItems.bind(dbUtil),
  updateItem: dbUtil.updateItem.bind(dbUtil),
  deleteItem: dbUtil.deleteItem.bind(dbUtil),
};
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as any).window;
const originalLocalStorage = (globalThis as any).localStorage;

const originalSessionStorage = (globalThis as any).sessionStorage;

afterEach(() => {
  dbUtil.addItem = originalDbMethods.addItem;
  dbUtil.getItems = originalDbMethods.getItems;
  dbUtil.updateItem = originalDbMethods.updateItem;
  dbUtil.deleteItem = originalDbMethods.deleteItem;
  globalThis.fetch = originalFetch;

  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    (globalThis as any).window = originalWindow;
  }

  if (originalLocalStorage === undefined) {
    delete (globalThis as any).localStorage;
  } else {
    (globalThis as any).localStorage = originalLocalStorage;
  }

  if (originalSessionStorage === undefined) {
    delete (globalThis as any).sessionStorage;
  } else {
    (globalThis as any).sessionStorage = originalSessionStorage;
  }
});

test('computeNextRetryDelayMs grows exponentially and caps at MAX_BACKOFF_MS', () => {
  assert.equal(MAX_RETRIES, 5);
  assert.equal(MAX_BACKOFF_MS, 300_000);
  assert.equal(computeNextRetryDelayMs(0), 1000);
  assert.equal(computeNextRetryDelayMs(1), 2000);
  assert.equal(computeNextRetryDelayMs(2), 4000);
  assert.equal(computeNextRetryDelayMs(5), 32000);
  assert.equal(computeNextRetryDelayMs(12), MAX_BACKOFF_MS);
  assert.equal(computeNextRetryDelayMs(-3), 1000);
});

test('isActionDueForSync gates on pending status and nextRetryAt timestamp', () => {
  const base: SyncAction = {
    id: 1,
    store: STORES.TRANSACTIONS,
    type: 'CREATE',
    payload: { id: 'tx-1' },
    timestamp: 1000,
    status: 'pending',
    retryCount: 0,
  };

  assert.equal(isActionDueForSync(base, 2000), true);
  assert.equal(isActionDueForSync({ ...base, status: 'processing' }, 2000), false);
  assert.equal(isActionDueForSync({ ...base, status: 'failed' }, 2000), false);
  assert.equal(isActionDueForSync({ ...base, nextRetryAt: 5000 }, 4999), false);
  assert.equal(isActionDueForSync({ ...base, nextRetryAt: 5000 }, 5000), true);
});

test('computeFailedActionUpdate tracks lastError, schedules backoff, and transitions to failed at MAX_RETRIES', () => {
  const now = 1_000_000;
  let action: SyncAction = {
    id: 7,
    store: STORES.PRODUCTS,
    type: 'UPDATE',
    payload: { id: 'p-1', updatedAt: now },
    timestamp: now,
    status: 'processing',
    retryCount: 0,
  };

  for (let attempt = 1; attempt < MAX_RETRIES; attempt++) {
    action = computeFailedActionUpdate(action, `HTTP 503 attempt ${attempt}`, now + attempt * 10);
    assert.equal(action.retryCount, attempt);
    assert.equal(action.status, 'pending');
    assert.equal(action.lastError, `HTTP 503 attempt ${attempt}`);
    assert.equal(
      action.nextRetryAt,
      now + attempt * 10 + computeNextRetryDelayMs(attempt)
    );
  }

  const finalAction = computeFailedActionUpdate(action, 'Final timeout', now + 999);
  assert.equal(finalAction.retryCount, MAX_RETRIES);
  assert.equal(finalAction.status, 'failed');
  assert.equal(finalAction.nextRetryAt, undefined);
  assert.equal(finalAction.lastError, 'Final timeout');
});

test('queueAction preserves updatedAt and isDeleted tombstone for DELETE operations', async () => {
  const recorded: SyncAction[] = [];
  (dbUtil as any).addItem = async (_store: any, item: SyncAction) => {
    recorded.push(item);
    return 1;
  };

  await queueAction(STORES.CUSTOMERS, 'DELETE', { id: 'cust-9', updatedAt: 555_000 });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].type, 'DELETE');
  assert.equal(recorded[0].status, 'pending');
  assert.equal(recorded[0].retryCount, 0);
  assert.equal(recorded[0].payload.updatedAt, 555_000);
  assert.equal(recorded[0].payload.isDeleted, true);
});

test('processQueue deletes succeeded actions and moves exhausted actions to failed without losing items', async () => {
  const storeMap = new Map<string, string>([
    ['pos_firebase_rtdb_url', 'https://unit-test-default-rtdb.firebaseio.com'],
  ]);
  (globalThis as any).localStorage = {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => storeMap.set(k, v),
    removeItem: (k: string) => storeMap.delete(k),
  };
  (globalThis as any).window = {
    navigator: { onLine: true },
    localStorage: (globalThis as any).localStorage,
  };

  let actions: SyncAction[] = [
    {
      id: 101,
      store: STORES.PRODUCTS,
      type: 'CREATE',
      payload: { id: 'prod-ok', name: 'Kape', updatedAt: 100 },
      timestamp: 100,
      status: 'pending',
      retryCount: 0,
    },
    {
      id: 102,
      store: STORES.TRANSACTIONS,
      type: 'CREATE',
      payload: { id: 'tx-fail', total: 20, updatedAt: 100 },
      timestamp: 100,
      status: 'pending',
      retryCount: MAX_RETRIES - 1,
    },
  ];

  (dbUtil as any).getItems = async (store: any) => {
    if (store === STORES.SYNC_QUEUE) return actions.map((a) => ({ ...a }));
    return [];
  };
  dbUtil.updateItem = async (store: any, item: any) => {
    if (store === STORES.SYNC_QUEUE) {
      actions = actions.map((a) => (a.id === item.id ? { ...item } : a));
    }
    return item;
  };
  dbUtil.deleteItem = async (store: any, id: any) => {
    if (store === STORES.SYNC_QUEUE) {
      actions = actions.filter((a) => a.id !== id);
    }
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('prod-ok')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Upstream unavailable' }), { status: 503 });
  }) as typeof fetch;

  await processQueue();

  assert.equal(actions.some((a) => a.id === 101), false);
  const failed = actions.find((a) => a.id === 102)!;
  assert.ok(failed);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.retryCount, MAX_RETRIES);
  assert.equal(failed.lastError, 'HTTP 503');
  assert.equal(failed.nextRetryAt, undefined);
});
