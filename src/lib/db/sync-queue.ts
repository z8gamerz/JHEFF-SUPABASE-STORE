'use client';

import { dbUtil, STORES, SyncAction, StoreName } from './idb';
import { realtimeSync } from './realtime-sync';
import { getConfiguredRtdbUrl, getFirebaseAuthToken } from './firebase-config';
import { getCloudProvider, isCloudSyncConfigured } from './cloud-provider';
import {
  supabaseClearStores,
  supabasePullStore,
  supabasePushDirect,
} from './supabase-sync';

/**
 * [SaaS ARCHITECT NOTE]
 * High-performance, low-latency sync engine for multi-device POS operations.
 *
 * 1. Zero-Delay Auto-Push: Changes push directly to Firebase Realtime Database in parallel.
 * 2. Guaranteed Delivery: If offline or delayed, operations queue in IndexedDB 'sync_queue' for auto-retry
 *    with bounded exponential backoff and MAX_RETRIES cap.
 * 3. Realtime Auto-Push Stream: Firebase SSE push stream delivers remote updates instantly to other devices.
 * 4. Conflict Resolution: Uses 'updatedAt' (Last Write Wins) with 'isDeleted' tombstone preservation.
 */

export const MAX_RETRIES = 5;
export const MAX_BACKOFF_MS = 300_000;

export function computeNextRetryDelayMs(retryCount: number): number {
  const safeCount = Math.max(0, Math.floor(retryCount));
  return Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, safeCount));
}

export function isActionDueForSync(action: SyncAction, now: number = Date.now()): boolean {
  if (action.status !== 'pending') return false;
  return !action.nextRetryAt || action.nextRetryAt <= now;
}

export function computeFailedActionUpdate(
  action: SyncAction,
  errorMessage: string,
  now: number = Date.now()
): SyncAction {
  const nextRetryCount = (action.retryCount || 0) + 1;
  const reachedMax = nextRetryCount >= MAX_RETRIES;
  return {
    ...action,
    status: reachedMax ? 'failed' : 'pending',
    retryCount: nextRetryCount,
    nextRetryAt: reachedMax ? undefined : now + computeNextRetryDelayMs(nextRetryCount),
    lastError: errorMessage,
  };
}

function getRtdbUrl(): string {
  return getConfiguredRtdbUrl();
}

export function getAuthToken(): string {
  return getFirebaseAuthToken();
}

export function getAuthQuery(): string {
  const token = getAuthToken();
  return token ? `?auth=${encodeURIComponent(token)}` : '';
}

/**
 * Direct parallel auto-push to Firebase Realtime Database.
 * Runs instantly without waiting for batch queues.
 */
export async function pushDirect(
  store: StoreName,
  key: string,
  payload: any,
  isDelete: boolean = false
): Promise<boolean> {
  if (typeof window === 'undefined' || !window.navigator.onLine) {
    return false;
  }

  if (getCloudProvider() === 'supabase') {
    const ok = await supabasePushDirect(store, key, payload, isDelete);
    if (ok) {
      realtimeSync.broadcastLocalChange(store, key, payload);
      return true;
    }
    return false;
  }

  const BASE_URL = getRtdbUrl();
  if (!BASE_URL) {
    return false;
  }

  try {
    const url = `${BASE_URL}/${store}/${key}.json${getAuthQuery()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      method: isDelete ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: isDelete ? undefined : JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      realtimeSync.broadcastLocalChange(store, key, payload);
      return true;
    }
  } catch (e) {
    console.warn(`[CloudSync] Direct push skipped or delayed for ${store}/${key}, queued for auto-retry:`, e);
  }
  return false;
}

/**
 * Queues an action to be synchronized with the server when online.
 */
export async function queueAction(
  store: StoreName,
  type: 'CREATE' | 'UPDATE' | 'DELETE',
  payload: any
): Promise<void> {
  const now = Date.now();
  const action: SyncAction = {
    store,
    type,
    payload: {
      ...payload,
      updatedAt: payload?.updatedAt || now,
      isDeleted: type === 'DELETE' ? true : Boolean(payload?.isDeleted),
    },
    timestamp: now,
    status: 'pending',
    retryCount: 0,
  };

  try {
    await dbUtil.addItem(STORES.SYNC_QUEUE, action);

    // Trigger background sync if online and configured
    if (typeof window !== 'undefined' && window.navigator.onLine && isCloudSyncConfigured()) {
      processQueue();
    }
  } catch (error) {
    console.error('[CloudSync] Failed to queue action:', error);
  }
}

/**
 * Marks a specific action as successfully synchronized.
 */
export async function markAsSynced(actionId: number): Promise<void> {
  try {
    await dbUtil.deleteItem(STORES.SYNC_QUEUE, actionId);
  } catch (error) {
    console.error(`[CloudSync] Failed to mark action ${actionId} as synced:`, error);
  }
}

/**
 * Processes due pending synchronization actions in batches with bounded exponential backoff.
 */
export async function processQueue(): Promise<void> {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return;
  }

  const provider = getCloudProvider();
  const BASE_URL = getRtdbUrl();
  if (provider === 'supabase') {
    if (!isCloudSyncConfigured()) return;
  } else if (!BASE_URL) {
    return;
  }

  const now = Date.now();
  const queue = await dbUtil.getItems<SyncAction>(STORES.SYNC_QUEUE);
  const dueActions = queue.filter((a) => isActionDueForSync(a, now));

  if (dueActions.length === 0) return;

  const BATCH_SIZE = 50;
  const batch = dueActions.slice(0, BATCH_SIZE);
  const authQuery = getAuthQuery();

  try {
    for (const action of batch) {
      action.status = 'processing';
      await dbUtil.updateItem(STORES.SYNC_QUEUE, action);
    }

    let hasSuccess = false;

    for (const action of batch) {
      const { store, payload, type } = action;
      const key = payload?.id || payload?.key;
      if (!key) {
        if (action.id) await markAsSynced(action.id);
        continue;
      }

      if ((action.retryCount || 0) >= 3 && store === STORES.AUDIT_LOGS) {
        if (action.id) await markAsSynced(action.id);
        continue;
      }

      if (provider === 'supabase') {
        try {
          const ok = await supabasePushDirect(store, key, payload, type === 'DELETE');
          if (ok) {
            hasSuccess = true;
            if (action.id) {
              await markAsSynced(action.id);
            }
          } else {
            const updated = computeFailedActionUpdate(action, 'Supabase upsert rejected', Date.now());
            await dbUtil.updateItem(STORES.SYNC_QUEUE, updated);
          }
        } catch (reqError: any) {
          const updated = computeFailedActionUpdate(
            action,
            reqError?.message || 'Supabase request failed',
            Date.now()
          );
          await dbUtil.updateItem(STORES.SYNC_QUEUE, updated);
        }
        continue;
      }

      const url = `${BASE_URL}/${store}/${key}.json${authQuery}`;
      try {
        const response = await fetch(url, {
          method: type === 'DELETE' ? 'DELETE' : 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: type === 'DELETE' ? undefined : JSON.stringify(payload)
        });

        if (response.ok) {
          hasSuccess = true;
          if (action.id) {
            await markAsSynced(action.id);
          }
        } else {
          if (response.status === 401 || response.status === 403) {
            if (typeof window !== 'undefined') {
              localStorage.setItem('firebase_sync_error', 'Unauthorized');
            }
          }
          const updated = computeFailedActionUpdate(action, `HTTP ${response.status}`, Date.now());
          await dbUtil.updateItem(STORES.SYNC_QUEUE, updated);
        }
      } catch (reqError: any) {
        const updated = computeFailedActionUpdate(
          action,
          reqError?.message || 'Network request failed',
          Date.now()
        );
        await dbUtil.updateItem(STORES.SYNC_QUEUE, updated);
      }
    }

    if (hasSuccess) {
      const storeInfo = await dbUtil.getItems<any>(STORES.STORE_INFO);
      if (storeInfo.length > 0) {
        const info = storeInfo[0];
        info.lastSyncedAt = Date.now();
        await dbUtil.updateItem(STORES.STORE_INFO, info);
      }
    }

    const afterNow = Date.now();
    const remainingDue = (await dbUtil.getItems<SyncAction>(STORES.SYNC_QUEUE)).filter((a) =>
      isActionDueForSync(a, afterNow)
    );
    if (remainingDue.length > 0) {
      processQueue();
    }
  } catch (error) {
    console.warn('[CloudSync] Queue processing deferred:', error);
  }
}

/**
 * Pulls a specific store on demand immediately from Firebase RTDB (e.g. users, store_info).
 */
export async function pullStore(store: StoreName): Promise<any[]> {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return dbUtil.getItems<any>(store);
  }

  if (getCloudProvider() === 'supabase') {
    return supabasePullStore(store);
  }

  const BASE_URL = getRtdbUrl();
  if (!BASE_URL) {
    return dbUtil.getItems<any>(store);
  }

  try {
    const url = `${BASE_URL}/${store}.json${getAuthQuery()}`;
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('firebase_sync_error', 'Unauthorized');
        }
      }
      return dbUtil.getItems<any>(store);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('firebase_sync_error');
    }
    const text = await response.text();
    if (!text || text === 'null') return [];
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return dbUtil.getItems<any>(store);
    }
    if (!data) return [];

    const cloudItems: any[] = Array.isArray(data)
      ? data.filter(Boolean)
      : Object.values(data);

    for (const cloudItem of cloudItems) {
      const key = cloudItem.id || cloudItem.key;
      if (!key) continue;
      const localItem = await dbUtil.getItemById<any>(store, key);
      const cloudUpdatedAt = cloudItem.updatedAt || 0;
      const localUpdatedAt = localItem?.updatedAt || 0;

      if (!localItem || cloudUpdatedAt >= localUpdatedAt) {
        if (cloudItem.isDeleted) {
          await dbUtil.deleteItem(store, key);
        } else {
          await dbUtil.updateItem(store, cloudItem);
        }
      }
    }

    return dbUtil.getItems<any>(store);
  } catch (err) {
    console.warn(`[CloudSync] Fast pull for store ${store} failed:`, err);
    return dbUtil.getItems<any>(store);
  }
}

/**
 * Pulls all updates from Firebase Realtime Database and merges them locally.
 * Uses Last Write Wins based on 'updatedAt' timestamp.
 */
export async function pullSync(): Promise<void> {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return;
  }

  if (!isCloudSyncConfigured()) {
    return;
  }

  const storesToSync = [
    STORES.STORE_INFO,
    STORES.BRANCHES,
    STORES.CATEGORIES,
    STORES.PRODUCTS,
    STORES.TRANSACTIONS,
    STORES.CUSTOMERS,
    STORES.CREDIT_LOG,
    STORES.METADATA,
    STORES.EWALLET_TRANSACTIONS,
    STORES.SUPPLIERS,
    STORES.RESTOCK_TRANSACTIONS,
    STORES.AUDIT_LOGS,
    STORES.USERS,
    STORES.EXPENSES
  ];

  await Promise.all(
    storesToSync.map(store => pullStore(store).catch(err => {
      console.warn(`[CloudSync] Error syncing store ${store}:`, err);
    }))
  );

  try {
    const storeInfo = await dbUtil.getItems<any>(STORES.STORE_INFO);
    if (storeInfo.length > 0) {
      const info = storeInfo[0];
      info.lastSyncedAt = Date.now();
      await dbUtil.updateItem(STORES.STORE_INFO, info);
    }
  } catch (error) {
    console.error('[CloudSync] Failed to update sync timestamp:', error);
  }
}

/**
 * SaaS-ready DB wrapper with immediate auto-push and offline fallback.
 */
export const syncDb = {
  async add<T>(store: StoreName, item: T): Promise<any> {
    const now = Date.now();
    const payload = {
      ...item,
      updatedAt: (item as any).updatedAt || now,
      isDeleted: false,
    };
    const result = await dbUtil.addItem(store, payload);
    const key = (payload as any).id || (payload as any).key;

    if (key) {
      const pushed = await pushDirect(store, key, payload, false);
      if (!pushed) {
        await queueAction(store, 'CREATE', payload);
      }
    }
    return result;
  },

  async update<T>(store: StoreName, item: T): Promise<any> {
    const now = Date.now();
    const payload = {
      ...item,
      updatedAt: (item as any).updatedAt || now,
    };
    const result = await dbUtil.updateItem(store, payload);
    const key = (payload as any).id || (payload as any).key;

    if (key) {
      const pushed = await pushDirect(store, key, payload, false);
      if (!pushed) {
        await queueAction(store, 'UPDATE', payload);
      }
    }
    return result;
  },

  async delete(store: StoreName, id: string | number): Promise<void> {
    const item = await dbUtil.getItemById<any>(store, id);
    if (item) {
      const key = (item as any).id || (item as any).key || id;
      await dbUtil.deleteItem(store, id);
      const deletePayload = {
        ...item,
        id: key,
        isDeleted: true,
        updatedAt: Date.now()
      };
      const pushed = await pushDirect(store, key, deletePayload, true);
      if (!pushed) {
        await queueAction(store, 'DELETE', deletePayload);
      }
    }
  }
};

/**
 * Wipes all data both locally in IndexedDB and remotely in Firebase Realtime Database.
 */
export async function clearDatabaseAll(): Promise<void> {
  const storesToClear = [
    STORES.PRODUCTS,
    STORES.TRANSACTIONS,
    STORES.CUSTOMERS,
    STORES.CREDIT_LOG,
    STORES.EWALLET_TRANSACTIONS,
    STORES.SUPPLIERS,
    STORES.RESTOCK_TRANSACTIONS,
    STORES.AUDIT_LOGS,
    STORES.METADATA,
    STORES.SYNC_QUEUE,
    STORES.EXPENSES
  ];

  for (const store of storesToClear) {
    try {
      await dbUtil.clearStore(store);
    } catch (e) {
      console.error(`[CloudSync] Failed to clear local store ${store}:`, e);
    }
  }

  const provider = getCloudProvider();
  const BASE_URL = getRtdbUrl();
  const authQuery = getAuthQuery();

  if (provider === 'supabase' && typeof window !== 'undefined' && window.navigator.onLine) {
    await supabaseClearStores([...storesToClear, STORES.BRANCHES]);
  } else if (BASE_URL && typeof window !== 'undefined' && window.navigator.onLine) {
    for (const store of storesToClear) {
      try {
        const url = `${BASE_URL}/${store}.json${authQuery}`;
        await fetch(url, { method: 'DELETE' });
      } catch (e) {
        console.error(`[CloudSync] Error deleting store ${store} on Firebase:`, e);
      }
    }
  }

  try {
    await dbUtil.clearStore(STORES.BRANCHES);
    localStorage.removeItem('sarisari_current_branch_id');

    if (provider === 'firebase' && BASE_URL && typeof window !== 'undefined' && window.navigator.onLine) {
      await fetch(`${BASE_URL}/${STORES.BRANCHES}.json${authQuery}`, { method: 'DELETE' });
    }
  } catch (e) {
    console.error('Failed to clear branches:', e);
  }
}

// Start realtime sync stream on startup if in browser
if (typeof window !== 'undefined') {
  realtimeSync.start();
  window.addEventListener('online', () => {
    processQueue();
    realtimeSync.start();
  });
}
