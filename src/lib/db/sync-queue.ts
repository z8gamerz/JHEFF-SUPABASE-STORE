'use client';

import { dbUtil, STORES, SyncAction, StoreName } from './idb';
import { realtimeSync } from './realtime-sync';

/**
 * [SaaS ARCHITECT NOTE]
 * High-performance, low-latency sync engine for multi-device POS operations.
 * 
 * 1. Zero-Delay Auto-Push: Changes push directly to Firebase Realtime Database in parallel.
 * 2. Guaranteed Delivery: If offline or delayed, operations queue in IndexedDB 'sync_queue' for auto-retry.
 * 3. Realtime Auto-Push Stream: Firebase SSE push stream delivers remote updates instantly to other devices.
 * 4. Conflict Resolution: Uses 'updatedAt' (Last Write Wins).
 */

function getRtdbUrl(): string {
  return ((import.meta as any).env?.VITE_FIREBASE_RTDB_URL || 
    'https://database-for-inventory-88e9f-default-rtdb.asia-southeast1.firebasedatabase.app/').replace(/\/$/, '');
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

  const BASE_URL = getRtdbUrl();

  try {
    const url = `${BASE_URL}/${store}/${key}.json`;
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
      console.log(`[CloudSync] Instant auto-push success for ${store}/${key}`);
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
  const action: SyncAction = {
    store,
    type,
    payload: {
      ...payload,
      updatedAt: Date.now(),
      isDeleted: type === 'DELETE'
    },
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  try {
    await dbUtil.addItem(STORES.SYNC_QUEUE, action);
    console.log(`[CloudSync] Queued ${type} for ${store}`);
    
    // Trigger background sync if online
    if (typeof window !== 'undefined' && window.navigator.onLine) {
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
    console.log(`[CloudSync] Action ${actionId} synced and removed from queue.`);
  } catch (error) {
    console.error(`[CloudSync] Failed to mark action ${actionId} as synced:`, error);
  }
}

/**
 * Processes the pending synchronization queue in batches.
 */
export async function processQueue(): Promise<void> {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return;
  }

  const queue = await dbUtil.getItems<SyncAction>(STORES.SYNC_QUEUE);
  const pendingActions = queue.filter(a => a.status === 'pending' || a.status === 'failed');

  if (pendingActions.length === 0) return;

  console.log(`[CloudSync] Syncing ${pendingActions.length} changes to cloud...`);

  const BATCH_SIZE = 50;
  const batch = pendingActions.slice(0, BATCH_SIZE);
  const BASE_URL = getRtdbUrl();

  try {
    for (const action of batch) {
      action.status = 'processing';
      await dbUtil.updateItem(STORES.SYNC_QUEUE, action);
    }

    for (const action of batch) {
      const { store, payload, type } = action;
      const key = payload.id || payload.key;
      if (!key) {
        console.warn('[CloudSync] Missing key for action payload:', payload);
        continue;
      }

      const url = `${BASE_URL}/${store}/${key}.json`;
      const response = await fetch(url, {
        method: type === 'DELETE' ? 'DELETE' : 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: type === 'DELETE' ? undefined : JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Sync failed for action on ${store}/${key}: ${response.statusText}`);
      }
    }
    
    for (const action of batch) {
      if (action.id) {
        await markAsSynced(action.id);
      }
    }

    const storeInfo = await dbUtil.getItems<any>(STORES.STORE_INFO);
    if (storeInfo.length > 0) {
      const info = storeInfo[0];
      info.lastSyncedAt = Date.now();
      await dbUtil.updateItem(STORES.STORE_INFO, info);
    }

    if (pendingActions.length > BATCH_SIZE) {
      processQueue();
    }
  } catch (error) {
    console.error('[CloudSync] Batch sync failed:', error);
    for (const action of batch) {
      action.status = 'failed';
      action.retryCount += 1;
      await dbUtil.updateItem(STORES.SYNC_QUEUE, action);
    }
  }
}

/**
 * Pulls a specific store on demand immediately from Firebase RTDB (e.g. users, store_info).
 */
export async function pullStore(store: StoreName): Promise<any[]> {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return dbUtil.getItems<any>(store);
  }

  const BASE_URL = getRtdbUrl();

  try {
    const url = `${BASE_URL}/${store}.json`;
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

  const storesToSync = [
    STORES.STORE_INFO,
    STORES.BRANCHES,
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

  console.log('[CloudSync] Starting parallel pull sync from Firebase RTDB...');
  
  // Parallel fetch for speed across all tables
  await Promise.all(
    storesToSync.map(store => pullStore(store).catch(err => {
      console.warn(`[CloudSync] Error syncing store ${store}:`, err);
    }))
  );

  // Update store-wide sync timestamp
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

  console.log('[CloudSync] Pull sync completed.');
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

    // Instant auto-push to cloud
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

    // Instant auto-push to cloud
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

  console.log('[CloudSync] Clearing all local IndexedDB stores...');

  for (const store of storesToClear) {
    try {
      await dbUtil.clearStore(store);
      console.log(`[CloudSync] Cleared local store: ${store}`);
    } catch (e) {
      console.error(`[CloudSync] Failed to clear local store ${store}:`, e);
    }
  }

  const BASE_URL = getRtdbUrl();
  
  if (typeof window !== 'undefined' && window.navigator.onLine) {
    console.log('[CloudSync] Deleting remote stores from Firebase...');
    for (const store of storesToClear) {
      try {
        const url = `${BASE_URL}/${store}.json`;
        const response = await fetch(url, { method: 'DELETE' });
        if (response.ok) {
          console.log(`[CloudSync] Successfully deleted store ${store} on Firebase.`);
        }
      } catch (e) {
        console.error(`[CloudSync] Error deleting store ${store} on Firebase:`, e);
      }
    }
  }

  try {
    await dbUtil.clearStore(STORES.BRANCHES);
    localStorage.removeItem('sarisari_current_branch_id');

    if (typeof window !== 'undefined' && window.navigator.onLine) {
      await fetch(`${BASE_URL}/${STORES.BRANCHES}.json`, { method: 'DELETE' });
    }
  } catch (e) {
    console.error('Failed to clear branches:', e);
  }

  console.log('[CloudSync] Database wipe completed.');
}

// Start realtime sync stream on startup if in browser
if (typeof window !== 'undefined') {
  realtimeSync.start();
  window.addEventListener('online', () => {
    console.log('[SyncQueue] Back online! Triggering sync...');
    processQueue();
    realtimeSync.start();
  });
}
