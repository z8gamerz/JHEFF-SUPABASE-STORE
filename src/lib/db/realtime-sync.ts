'use client';

import { dbUtil, STORES, StoreName } from './idb';

/**
 * Realtime Webhook & SSE Stream Manager
 * Connects to Firebase Realtime Database via Server-Sent Events (SSE).
 * Automatically pushes updates from any device to all other logged-in devices in real-time.
 */

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface RealtimeListener {
  id: string;
  stores?: StoreName[];
  callback: (store: StoreName, key: string, data: any) => void;
}

class RealtimeSyncManager {
  private eventSource: EventSource | null = null;
  private status: RealtimeStatus = 'disconnected';
  private statusListeners = new Set<(status: RealtimeStatus) => void>();
  private dataListeners = new Map<string, RealtimeListener>();
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private isStarted = false;
  private baseUrl: string = '';

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('sarisari_pos_realtime_stream');
        this.broadcastChannel.onmessage = (event) => {
          const { store, key, data } = event.data || {};
          if (store) {
            this.notifyDataListeners(store, key, data);
          }
        };
      } catch (e) {
        console.warn('[RealtimeSync] BroadcastChannel not supported:', e);
      }

      // Reconnect when device comes back online or regains focus
      window.addEventListener('online', () => {
        console.log('[RealtimeSync] Device online, reconnecting stream...');
        this.connect();
      });

      window.addEventListener('focus', () => {
        if (this.status !== 'connected' && this.isStarted) {
          this.connect();
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isStarted) {
          if (this.status !== 'connected') {
            this.connect();
          }
        }
      });
    }
  }

  private getBaseUrl(): string {
    if (this.baseUrl) return this.baseUrl;
    const url = ((import.meta as any).env?.VITE_FIREBASE_RTDB_URL || 
      'https://database-for-inventory-88e9f-default-rtdb.asia-southeast1.firebasedatabase.app/').replace(/\/$/, '');
    this.baseUrl = url;
    return url;
  }

  public getStatus(): RealtimeStatus {
    return this.status;
  }

  public subscribeStatus(callback: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private setStatus(newStatus: RealtimeStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusListeners.forEach((fn) => {
      try {
        fn(newStatus);
      } catch (err) {
        console.error('[RealtimeSync] Status listener error:', err);
      }
    });
  }

  /**
   * Subscribe to incoming store change events
   */
  public subscribe(
    stores: StoreName[] | undefined,
    callback: (store: StoreName, key: string, data: any) => void
  ): () => void {
    const id = crypto.randomUUID();
    this.dataListeners.set(id, { id, stores, callback });
    return () => {
      this.dataListeners.delete(id);
    };
  }

  private notifyDataListeners(store: StoreName, key: string, data: any) {
    // Notify in-process subscribers
    this.dataListeners.forEach((listener) => {
      if (!listener.stores || listener.stores.includes(store)) {
        try {
          listener.callback(store, key, data);
        } catch (err) {
          console.error('[RealtimeSync] Data listener error:', err);
        }
      }
    });

    // Fire window CustomEvent for cross-component triggers
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('pos_data_synced', {
          detail: { store, key, data, timestamp: Date.now() },
        })
      );
    }
  }

  /**
   * Broadcast an update sent by this device to other tabs & listeners immediately
   */
  public broadcastLocalChange(store: StoreName, key: string, data: any) {
    this.notifyDataListeners(store, key, data);
    try {
      this.broadcastChannel?.postMessage({ store, key, data });
    } catch {}
  }

  /**
   * Starts the realtime SSE stream
   */
  public start() {
    if (typeof window === 'undefined') return;
    this.isStarted = true;
    this.connect();
    this.startHeartbeat();
  }

  public restart() {
    this.disconnect();
    if (typeof window !== 'undefined') {
      this.isStarted = true;
      this.connect();
    }
  }

  public stop() {
    this.isStarted = false;
    this.disconnect();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setStatus('disconnected');
  }

  private connect() {
    if (typeof window === 'undefined' || !this.isStarted) return;
    if (!window.navigator.onLine) {
      this.setStatus('disconnected');
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setStatus('connecting');

    try {
      const token = typeof window !== 'undefined' ? (
        localStorage.getItem('pos_firebase_auth_token') || 
        localStorage.getItem('firebase_database_secret') ||
        sessionStorage.getItem('pos_firebase_auth_token') ||
        (import.meta as any).env?.VITE_FIREBASE_AUTH_TOKEN || 
        ''
      ) : '';
      const authQuery = token ? `?auth=${encodeURIComponent(token.trim())}` : '';
      const url = `${this.getBaseUrl()}/.json${authQuery}`;
      const es = new EventSource(url);
      this.eventSource = es;

      es.onopen = () => {
        console.log('[RealtimeSync] Webhook/SSE stream connected to Firebase RTDB');
        this.setStatus('connected');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('firebase_sync_error');
        }
      };

      es.addEventListener('put', (event) => {
        this.handleStreamMessage(event.data);
      });

      es.addEventListener('patch', (event) => {
        this.handleStreamMessage(event.data);
      });

      es.addEventListener('keep-alive', () => {
        // Heartbeat received from Firebase RTDB
      });

      es.onerror = (err) => {
        console.warn('[RealtimeSync] Stream connection error, scheduling reconnect:', err);
        this.setStatus('error');
        es.close();
        this.eventSource = null;
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('[RealtimeSync] Failed to initialize EventSource:', e);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isStarted && typeof window !== 'undefined' && window.navigator.onLine) {
        this.connect();
      }
    }, 4000);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Every 30 seconds verify connection health
    this.heartbeatTimer = setInterval(() => {
      if (this.isStarted && typeof window !== 'undefined' && window.navigator.onLine) {
        if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
          console.log('[RealtimeSync] Heartbeat detected closed connection, reconnecting...');
          this.connect();
        }
      }
    }, 30000);
  }

  /**
   * Processes incoming SSE event payload from Firebase
   */
  private async handleStreamMessage(rawJson: string) {
    if (!rawJson) return;

    try {
      const payload = JSON.parse(rawJson);
      const { path, data } = payload;
      if (!path) return;

      // Path format:
      // "/" -> full database snapshot
      // "/products" or "/products/some-id"
      // "/transactions/some-id"
      // "/users/some-id"
      const segments = path.replace(/^\//, '').split('/');
      const storeNameCandidate = segments[0] as StoreName;
      const validStores = Object.values(STORES);

      if (path === '/') {
        // Initial full snapshot received
        if (data && typeof data === 'object') {
          for (const storeKey of Object.keys(data)) {
            if (validStores.includes(storeKey as StoreName)) {
              await this.mergeStoreData(storeKey as StoreName, data[storeKey]);
            }
          }
        }
        return;
      }

      if (!validStores.includes(storeNameCandidate)) {
        return;
      }

      const store = storeNameCandidate;
      const itemId = segments[1];

      if (!itemId) {
        // Update to entire store
        if (data && typeof data === 'object') {
          await this.mergeStoreData(store, data);
        }
      } else {
        // Single item update or delete
        if (data === null) {
          // Deleted remotely
          await dbUtil.deleteItem(store, itemId);
          this.notifyDataListeners(store, itemId, { id: itemId, isDeleted: true });
        } else {
          // Single record updated or added
          await this.saveItemIfNewer(store, data);
          const key = data.id || data.key || itemId;
          this.notifyDataListeners(store, key, data);
        }
      }
    } catch (err) {
      console.error('[RealtimeSync] Error parsing stream message:', err);
    }
  }

  private async mergeStoreData(store: StoreName, rawStoreData: any) {
    if (!rawStoreData) return;
    const items: any[] = Array.isArray(rawStoreData)
      ? rawStoreData.filter(Boolean)
      : Object.values(rawStoreData);

    let changed = false;
    for (const item of items) {
      const isUpdated = await this.saveItemIfNewer(store, item);
      if (isUpdated) changed = true;
    }

    if (changed) {
      this.notifyDataListeners(store, 'bulk_sync', rawStoreData);
    }
  }

  private async saveItemIfNewer(store: StoreName, cloudItem: any): Promise<boolean> {
    const key = cloudItem.id || cloudItem.key;
    if (!key) return false;

    try {
      const localItem = await dbUtil.getItemById<any>(store, key);
      const cloudUpdated = cloudItem.updatedAt || 0;
      const localUpdated = localItem?.updatedAt || 0;

      if (!localItem || cloudUpdated >= localUpdated) {
        if (cloudItem.isDeleted) {
          await dbUtil.deleteItem(store, key);
        } else {
          await dbUtil.updateItem(store, cloudItem);
        }
        return true;
      }
    } catch (e) {
      console.warn(`[RealtimeSync] Could not save item to ${store}:`, e);
    }
    return false;
  }
}

export const realtimeSync = new RealtimeSyncManager();
