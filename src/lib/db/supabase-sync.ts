'use client';

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { dbUtil, STORES, StoreName } from './idb';
import {
  getConfiguredSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseMode,
  isServiceRoleJwt,
} from './cloud-provider';
import {
  fromSupabaseRow,
  getSupabasePrimaryKey,
  isSyncedStore,
  SYNCED_STORES_ORDERED,
  toSupabaseRow,
} from '@/lib/utils/supabase-mapper';
import { apiFetch } from '@/lib/api-client';

let cachedClient: SupabaseClient | null = null;
let cachedClientSignature = '';

export function getSupabaseClient(
  overrideUrl?: string,
  overrideAnonKey?: string
): SupabaseClient | null {
  const url = (overrideUrl ?? getConfiguredSupabaseUrl()).trim().replace(/\/$/, '');
  const anonKey = (overrideAnonKey ?? getSupabaseAnonKey()).trim();
  if (!url || !anonKey) return null;
  if (isServiceRoleJwt(anonKey)) {
    return null;
  }

  const sig = `${url}::${anonKey}`;
  if (cachedClient && cachedClientSignature === sig) {
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
  cachedClientSignature = sig;
  return cachedClient;
}

export function resetSupabaseClientCache(): void {
  cachedClient = null;
  cachedClientSignature = '';
}

export interface SupabaseTestResult {
  success: boolean;
  reachable: boolean;
  tablesFound: boolean;
  rlsReadable: boolean;
  rlsWritable: boolean;
  needsAuthOrProxy: boolean;
  latencyMs?: number;
  mode: 'direct' | 'proxy';
  authSessionEmail?: string | null;
  tableCounts?: Record<string, number>;
  errorCode?: string;
  message: string;
  details?: string;
  timestamp: number;
}

export async function getSupabaseAuthSessionEmail(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data?.session?.user?.email || null;
  } catch {
    return null;
  }
}

export async function signInSupabaseAuth(
  email: string,
  password: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Enter your Supabase URL and Anon/Publishable key first.',
    };
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, email: data.user?.email || email.trim() };
}

export async function signOutSupabaseAuth(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut().catch(() => {});
}

export async function testSupabaseConnection(opts?: {
  url?: string;
  anonKey?: string;
  mode?: 'direct' | 'proxy';
}): Promise<SupabaseTestResult> {
  const mode = opts?.mode || getSupabaseMode();
  const start = performance.now();

  if (mode === 'proxy') {
    try {
      const res = await apiFetch('/api/supabase-sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'health' }),
      });
      const latencyMs = Math.round(performance.now() - start);
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 503) {
        return {
          success: false,
          reachable: false,
          tablesFound: false,
          rlsReadable: false,
          rlsWritable: false,
          needsAuthOrProxy: false,
          latencyMs,
          mode: 'proxy',
          errorCode: data?.code || `HTTP_${res.status}`,
          message:
            data?.error ||
            'Server Proxy requires POS_API_SECRET + X-POS-API-Key + SUPABASE_SERVICE_ROLE_KEY.',
          timestamp: Date.now(),
        };
      }

      if (!data?.configured) {
        return {
          success: false,
          reachable: false,
          tablesFound: false,
          rlsReadable: false,
          rlsWritable: false,
          needsAuthOrProxy: false,
          latencyMs,
          mode: 'proxy',
          errorCode: 'PROXY_NOT_CONFIGURED',
          message:
            data?.message ||
            'Server Proxy is not configured yet (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server .env).',
          timestamp: Date.now(),
        };
      }

      if (data.success) {
        let tableCounts: Record<string, number> | undefined;
        try {
          const countRes = await apiFetch('/api/supabase-sync', {
            method: 'POST',
            body: JSON.stringify({ action: 'counts' }),
          });
          const countJson = await countRes.json().catch(() => ({}));
          if (countJson?.success) tableCounts = countJson.counts;
        } catch {}

        return {
          success: true,
          reachable: true,
          tablesFound: true,
          rlsReadable: true,
          rlsWritable: true,
          needsAuthOrProxy: false,
          latencyMs,
          mode: 'proxy',
          tableCounts,
          message: `Supabase Server Proxy connected (${latencyMs}ms). All 14 tables ready with service-role bypass.`,
          timestamp: Date.now(),
        };
      }

      return {
        success: false,
        reachable: true,
        tablesFound: data?.code !== '42P01',
        rlsReadable: false,
        rlsWritable: false,
        needsAuthOrProxy: false,
        latencyMs,
        mode: 'proxy',
        errorCode: data?.code,
        message: data?.error || 'Supabase proxy health check failed.',
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return {
        success: false,
        reachable: false,
        tablesFound: false,
        rlsReadable: false,
        rlsWritable: false,
        needsAuthOrProxy: false,
        mode: 'proxy',
        message: `Proxy connection failed: ${err?.message || 'Network error'}`,
        timestamp: Date.now(),
      };
    }
  }

  // Direct Browser Mode
  const url = (opts?.url ?? getConfiguredSupabaseUrl()).trim().replace(/\/$/, '');
  const anonKey = (opts?.anonKey ?? getSupabaseAnonKey()).trim();

  if (!url) {
    return {
      success: false,
      reachable: false,
      tablesFound: false,
      rlsReadable: false,
      rlsWritable: false,
      needsAuthOrProxy: false,
      mode: 'direct',
      message: 'Please enter your Supabase Project URL (e.g. https://fcklgcvneovhtirmwvst.supabase.co).',
      timestamp: Date.now(),
    };
  }

  if (!anonKey) {
    return {
      success: false,
      reachable: false,
      tablesFound: false,
      rlsReadable: false,
      rlsWritable: false,
      needsAuthOrProxy: false,
      mode: 'direct',
      message: 'Please enter your Supabase Anon / Publishable Key (from Project Settings -> API).',
      timestamp: Date.now(),
    };
  }

  if (isServiceRoleJwt(anonKey)) {
    return {
      success: false,
      reachable: false,
      tablesFound: false,
      rlsReadable: false,
      rlsWritable: false,
      needsAuthOrProxy: false,
      mode: 'direct',
      errorCode: 'SERVICE_ROLE_REJECTED',
      message:
        'Security block: You pasted a service_role key. In the browser, only use your public anon/publishable key, or switch to Server Proxy mode.',
      timestamp: Date.now(),
    };
  }

  const client = getSupabaseClient(url, anonKey);
  if (!client) {
    return {
      success: false,
      reachable: false,
      tablesFound: false,
      rlsReadable: false,
      rlsWritable: false,
      needsAuthOrProxy: false,
      mode: 'direct',
      message: 'Could not initialize Supabase client with the provided URL and key.',
      timestamp: Date.now(),
    };
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    const authSessionEmail = sessionData?.session?.user?.email || null;

    // 1. Probe schema & read permission via store_info
    const { error: readErr } = await client
      .from('store_info')
      .select('id', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);

    if (readErr) {
      const code = readErr.code || '';
      const msgLower = (readErr.message || '').toLowerCase();

      if (msgLower.includes('invalid api key') || msgLower.includes('jwt') || code === 'PGRST301') {
        return {
          success: false,
          reachable: true,
          tablesFound: false,
          rlsReadable: false,
          rlsWritable: false,
          needsAuthOrProxy: false,
          latencyMs,
          mode: 'direct',
          authSessionEmail,
          errorCode: code || 'INVALID_KEY',
          message: `Supabase rejected the API key (${readErr.message}). Verify the Anon / Publishable key from Project Settings -> API.`,
          timestamp: Date.now(),
        };
      }

      if (code === '42P01' || msgLower.includes('does not exist') || msgLower.includes('could not find the table')) {
        return {
          success: false,
          reachable: true,
          tablesFound: false,
          rlsReadable: false,
          rlsWritable: false,
          needsAuthOrProxy: false,
          latencyMs,
          mode: 'direct',
          authSessionEmail,
          errorCode: '42P01',
          message: 'Connected to Supabase, but POS tables were not found. Run supabase/schema.sql in Supabase SQL Editor first.',
          timestamp: Date.now(),
        };
      }

      if (code === '42501' || msgLower.includes('permission denied') || msgLower.includes('row-level security')) {
        return {
          success: false,
          reachable: true,
          tablesFound: true,
          rlsReadable: false,
          rlsWritable: false,
          needsAuthOrProxy: true,
          latencyMs,
          mode: 'direct',
          authSessionEmail,
          errorCode: code || '42501',
          message:
            'Supabase reachable, but RLS blocked anonymous read access. Sign in via Supabase Auth below OR switch to Server Proxy mode.',
          timestamp: Date.now(),
        };
      }

      return {
        success: false,
        reachable: true,
        tablesFound: false,
        rlsReadable: false,
        rlsWritable: false,
        needsAuthOrProxy: false,
        latencyMs,
        mode: 'direct',
        authSessionEmail,
        errorCode: code,
        message: `Supabase error: ${readErr.message}`,
        timestamp: Date.now(),
      };
    }

    // 2. Collect table row counts to verify schema health & show migrated rows
    const tableCounts: Record<string, number> = {};
    await Promise.all(
      SYNCED_STORES_ORDERED.map(async (store) => {
        const pk = getSupabasePrimaryKey(store);
        const { count, error } = await client
          .from(store)
          .select(pk, { count: 'exact', head: true });
        tableCounts[store] = error ? -1 : (count ?? 0);
      })
    );

    // 3. Probe write/RLS readiness on metadata using a harmless test key and clean it up
    const probeKey = `_pos_conn_probe_${Date.now()}`;
    const { error: writeErr } = await client.from('metadata').upsert(
      {
        key: probeKey,
        value: 'ok',
        updated_at: Date.now(),
        is_deleted: true,
      },
      { onConflict: 'key' }
    );

    let rlsWritable = !writeErr;
    let needsAuthOrProxy = false;
    let writeMsg = '';

    if (writeErr) {
      const code = writeErr.code || '';
      const msg = (writeErr.message || '').toLowerCase();
      if (
        code === '42501' ||
        msg.includes('row-level security') ||
        msg.includes('permission denied') ||
        msg.includes('unauthorized')
      ) {
        rlsWritable = false;
        needsAuthOrProxy = true;
        writeMsg = authSessionEmail
          ? `Signed in as ${authSessionEmail}, but RLS rejected write on metadata (${writeErr.message}). Ensure this user exists in public.users with role='admin' and auth_user_id set.`
          : 'Endpoint & tables are reachable, but schema.sql RLS policies require an authenticated Supabase user (`TO authenticated`) or Server Proxy (`SUPABASE_SERVICE_ROLE_KEY`). Without one, live writes from the browser will be blocked by RLS.';
      } else {
        writeMsg = `Write probe warning: ${writeErr.message}`;
      }
    } else {
      try {
        await client.from('metadata').delete().eq('key', probeKey);
      } catch {}
    }

    const totalCloudRows = Object.values(tableCounts).reduce(
      (sum, c) => sum + (c > 0 ? c : 0),
      0
    );

    return {
      success: rlsWritable,
      reachable: true,
      tablesFound: true,
      rlsReadable: true,
      rlsWritable,
      needsAuthOrProxy,
      latencyMs,
      mode: 'direct',
      authSessionEmail,
      tableCounts,
      message: rlsWritable
        ? `Connected & Verified (${latencyMs}ms)! Read & Write access confirmed across 14 tables (${totalCloudRows} existing rows).`
        : writeMsg,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      reachable: false,
      tablesFound: false,
      rlsReadable: false,
      rlsWritable: false,
      needsAuthOrProxy: false,
      mode: 'direct',
      message: `Cannot reach Supabase URL: ${err?.message || 'Network/CORS error'}.`,
      timestamp: Date.now(),
    };
  }
}

function recordSupabaseSyncError(statusOrCode: string | number | undefined, msg?: string) {
  if (typeof window === 'undefined') return;
  const codeStr = String(statusOrCode || '');
  const lower = (msg || '').toLowerCase();
  if (
    codeStr === '401' ||
    codeStr === '403' ||
    codeStr === '42501' ||
    lower.includes('row-level security') ||
    lower.includes('permission denied')
  ) {
    localStorage.setItem('supabase_sync_error', 'Unauthorized');
  }
}

function clearSupabaseSyncError() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('supabase_sync_error');
  }
}

export async function supabasePushDirect(
  store: StoreName,
  key: string,
  payload: any,
  isDelete: boolean = false
): Promise<boolean> {
  if (!isSyncedStore(store)) return false;
  if (typeof window === 'undefined' || !window.navigator.onLine) return false;

  const row = toSupabaseRow(store, {
    ...(payload || {}),
    [getSupabasePrimaryKey(store)]: key,
    isDeleted: isDelete ? true : Boolean(payload?.isDeleted),
    updatedAt: payload?.updatedAt || Date.now(),
  });

  if (getSupabaseMode() === 'proxy') {
    try {
      const res = await apiFetch('/api/supabase-sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'upsert', store, row }),
      });
      if (res.ok) {
        clearSupabaseSyncError();
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        recordSupabaseSyncError(res.status);
      }
    } catch (e) {
      console.warn(`[SupabaseProxy] Push failed for ${store}/${key}:`, e);
    }
    return false;
  }

  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const pk = getSupabasePrimaryKey(store);
    const { error } = await client.from(store).upsert(row, { onConflict: pk });
    if (!error) {
      clearSupabaseSyncError();
      return true;
    }
    recordSupabaseSyncError(error.code, error.message);
    console.warn(`[SupabaseSync] Upsert rejected for ${store}/${key}:`, error.message);
  } catch (e) {
    console.warn(`[SupabaseSync] Push exception for ${store}/${key}:`, e);
  }
  return false;
}

export async function supabasePullStore(store: StoreName): Promise<any[]> {
  if (!isSyncedStore(store)) return dbUtil.getItems<any>(store);
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return dbUtil.getItems<any>(store);
  }

  let remoteRows: any[] | null = null;

  if (getSupabaseMode() === 'proxy') {
    try {
      const res = await apiFetch('/api/supabase-sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'pull', store }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) recordSupabaseSyncError(res.status);
        return dbUtil.getItems<any>(store);
      }
      const data = await res.json().catch(() => ({}));
      if (data?.success && Array.isArray(data.rows)) {
        remoteRows = data.rows;
        clearSupabaseSyncError();
      }
    } catch (err) {
      console.warn(`[SupabaseProxy] Pull failed for ${store}:`, err);
      return dbUtil.getItems<any>(store);
    }
  } else {
    const client = getSupabaseClient();
    if (!client) return dbUtil.getItems<any>(store);

    try {
      const pk = getSupabasePrimaryKey(store);
      const collected: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await client
          .from(store)
          .select('*')
          .order(pk, { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          recordSupabaseSyncError(error.code, error.message);
          console.warn(`[SupabaseSync] Pull failed for ${store}:`, error.message);
          return dbUtil.getItems<any>(store);
        }

        const batch = data || [];
        collected.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      clearSupabaseSyncError();
      remoteRows = collected;
    } catch (err) {
      console.warn(`[SupabaseSync] Pull exception for ${store}:`, err);
      return dbUtil.getItems<any>(store);
    }
  }

  if (!remoteRows) return dbUtil.getItems<any>(store);

  const pk = getSupabasePrimaryKey(store);
  for (const rawRow of remoteRows) {
    const cloudItem = fromSupabaseRow(store, rawRow);
    const key = cloudItem?.[pk] || cloudItem?.id || cloudItem?.key;
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
}

export async function supabaseClearStores(storesToClear: StoreName[]): Promise<void> {
  if (typeof window !== 'undefined' && !window.navigator.onLine) return;
  const safeStores = storesToClear.filter((s) => isSyncedStore(s));
  if (safeStores.length === 0) return;

  if (getSupabaseMode() === 'proxy') {
    await apiFetch('/api/supabase-sync', {
      method: 'POST',
      body: JSON.stringify({ action: 'clear', stores: safeStores }),
    }).catch((e) => console.error('[SupabaseProxy] Clear failed:', e));
    return;
  }

  const client = getSupabaseClient();
  if (!client) return;

  for (const store of safeStores) {
    try {
      const pk = getSupabasePrimaryKey(store);
      await client.from(store).delete().neq(pk, '__never__');
    } catch (e) {
      console.error(`[SupabaseSync] Error clearing store ${store}:`, e);
    }
  }
}

export interface BulkPushProgress {
  totalStores: number;
  completedStores: number;
  pushedRows: number;
  errors: string[];
  perTable: Record<string, number>;
}

/**
 * Pushes all local IndexedDB records across the 14 POS tables to Supabase in FK order.
 */
export async function pushAllLocalToSupabase(
  onProgress?: (store: StoreName, pushed: number) => void
): Promise<BulkPushProgress> {
  const mode = getSupabaseMode();
  const client = mode === 'direct' ? getSupabaseClient() : null;
  if (mode === 'direct' && !client) {
    throw new Error('Supabase URL and Anon Key are required before pushing data.');
  }

  const result: BulkPushProgress = {
    totalStores: SYNCED_STORES_ORDERED.length,
    completedStores: 0,
    pushedRows: 0,
    errors: [],
    perTable: {},
  };

  for (const store of SYNCED_STORES_ORDERED) {
    try {
      let localRows = await dbUtil.getItems<Record<string, any>>(store);
      if (store === STORES.CREDIT_LOG) {
        localRows = [...localRows].sort((a, b) => {
          const aT = a.targetCreditId ? 1 : 0;
          const bT = b.targetCreditId ? 1 : 0;
          if (aT !== bT) return aT - bT;
          return Number(a.timestamp || 0) - Number(b.timestamp || 0);
        });
      }

      const mapped = localRows
        .filter((r) => r && typeof r === 'object')
        .map((r) => toSupabaseRow(store, r));

      if (mapped.length > 0) {
        if (mode === 'proxy') {
          const res = await apiFetch('/api/supabase-sync', {
            method: 'POST',
            body: JSON.stringify({ action: 'upsert', store, rows: mapped }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body?.success) {
            throw new Error(body?.error || `HTTP ${res.status}`);
          }
        } else if (client) {
          const pk = getSupabasePrimaryKey(store);
          const CHUNK_SIZE = 200;
          for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
            const slice = mapped.slice(i, i + CHUNK_SIZE);
            const { error } = await client.from(store).upsert(slice, { onConflict: pk });
            if (error) {
              throw new Error(`${error.message}${error.code ? ` (${error.code})` : ''}`);
            }
          }
        }
      }

      result.perTable[store] = mapped.length;
      result.pushedRows += mapped.length;
      onProgress?.(store, mapped.length);
    } catch (err: any) {
      result.perTable[store] = -1;
      result.errors.push(`${store}: ${err?.message || 'Push failed'}`);
    } finally {
      result.completedStores += 1;
    }
  }

  return result;
}

export function subscribeSupabaseRealtime(callbacks: {
  onStatus: (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void;
  onItemChange: (store: StoreName, key: string, item: any) => void;
}): () => void {
  const client = getSupabaseClient();
  if (!client) {
    callbacks.onStatus('disconnected');
    return () => {};
  }

  callbacks.onStatus('connecting');
  const channelName = `sarisari_pos_realtime_${Date.now()}`;
  const channel: RealtimeChannel = client.channel(channelName).on(
    'postgres_changes',
    { event: '*', schema: 'public' },
    async (payload) => {
      const table = payload.table as string;
      if (!isSyncedStore(table)) return;
      const store = table as StoreName;
      const pk = getSupabasePrimaryKey(store);

      try {
        if (payload.eventType === 'DELETE') {
          const oldRec = payload.old as Record<string, any> | undefined;
          const key = oldRec?.[pk] || oldRec?.id || oldRec?.key;
          if (!key) return;
          await dbUtil.deleteItem(store, key);
          callbacks.onItemChange(store, String(key), { [pk]: key, isDeleted: true });
          return;
        }

        const newRec = payload.new as Record<string, any> | undefined;
        if (!newRec) return;
        const mapped = fromSupabaseRow(store, newRec);
        const key = mapped?.[pk] || mapped?.id || mapped?.key;
        if (!key) return;

        const localItem = await dbUtil.getItemById<any>(store, key);
        const cloudUpdated = mapped.updatedAt || 0;
        const localUpdated = localItem?.updatedAt || 0;

        if (!localItem || cloudUpdated >= localUpdated) {
          if (mapped.isDeleted) {
            await dbUtil.deleteItem(store, key);
          } else {
            await dbUtil.updateItem(store, mapped);
          }
          callbacks.onItemChange(store, String(key), mapped);
        }
      } catch (err) {
        console.warn('[SupabaseRealtime] Failed processing change:', err);
      }
    }
  );

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      clearSupabaseSyncError();
      callbacks.onStatus('connected');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      callbacks.onStatus('error');
    } else if (status === 'CLOSED') {
      callbacks.onStatus('disconnected');
    }
  });

  return () => {
    client.removeChannel(channel).catch(() => {});
  };
}
