import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { applyApiGuards, parseJsonBody, requireEnv } from './_security.ts';
import {
  getSupabasePrimaryKey,
  isSyncedStore,
  SYNCED_STORES_ORDERED,
} from '../src/lib/utils/supabase-mapper.ts';

function getServerSupabaseClient(): {
  client: SupabaseClient | null;
  url: string;
  hasServiceKey: boolean;
} {
  const url = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return { client: null, url, hasServiceKey: Boolean(serviceKey) };
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, url, hasServiceKey: true };
}

export default async function handler(req: any, res: any) {
  if (
    !applyApiGuards(req, res, {
      methods: 'GET, POST, OPTIONS',
      rateKey: 'supabase-sync',
      rateLimitMax: 240,
      rateWindowMs: 60_000,
    })
  ) {
    return;
  }

  const parsed =
    req.method === 'POST'
      ? await parseJsonBody(req, 5 * 1024 * 1024)
      : { ok: true, body: {} };

  if (!parsed.ok) {
    res.status(parsed.status || 400).json({
      success: false,
      error: parsed.error || 'Invalid request payload.',
    });
    return;
  }

  const action = String(
    req.query?.action || parsed.body?.action || (req.method === 'GET' ? 'health' : '')
  ).trim();

  const { client, url, hasServiceKey } = getServerSupabaseClient();

  if (action === 'health') {
    if (!client) {
      res.status(200).json({
        success: false,
        configured: false,
        hasUrl: Boolean(url),
        hasServiceKey,
        status: 'not_configured',
        message: 'Server proxy requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      });
      return;
    }

    const start = Date.now();
    try {
      const { count, error } = await client
        .from('store_info')
        .select('id', { count: 'exact', head: true });
      const latencyMs = Date.now() - start;
      if (error) {
        res.status(200).json({
          success: false,
          configured: true,
          hasUrl: true,
          hasServiceKey: true,
          latencyMs,
          error: error.message,
          code: error.code,
        });
        return;
      }
      res.status(200).json({
        success: true,
        configured: true,
        hasUrl: true,
        hasServiceKey: true,
        latencyMs,
        storeInfoCount: count ?? 0,
      });
      return;
    } catch (err: any) {
      res.status(502).json({
        success: false,
        configured: true,
        error: err?.message || 'Supabase health check failed.',
      });
      return;
    }
  }

  if (!client) {
    res.status(503).json({
      success: false,
      error: 'Supabase server proxy is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).',
      code: 'SUPABASE_PROXY_NOT_CONFIGURED',
    });
    return;
  }

  if (action === 'counts') {
    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        SYNCED_STORES_ORDERED.map(async (store) => {
          const pk = getSupabasePrimaryKey(store);
          const { count, error } = await client
            .from(store)
            .select(pk, { count: 'exact', head: true });
          counts[store] = error ? -1 : (count ?? 0);
        })
      );
      res.status(200).json({ success: true, counts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Count check failed.' });
    }
    return;
  }

  if (action === 'clear') {
    const requestedStores = Array.isArray(parsed.body?.stores) ? parsed.body.stores : [];
    const safeStores = requestedStores.filter(
      (s: unknown): s is string => typeof s === 'string' && isSyncedStore(s)
    );
    try {
      for (const store of safeStores) {
        const pk = getSupabasePrimaryKey(store);
        const { error } = await client.from(store).delete().neq(pk, '__never__');
        if (error) {
          res.status(500).json({ success: false, error: error.message });
          return;
        }
      }
      res.status(200).json({ success: true, cleared: safeStores });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Clear failed.' });
    }
    return;
  }

  const store = String(parsed.body?.store || '').trim();
  if (!isSyncedStore(store)) {
    res.status(400).json({
      success: false,
      error: `Invalid or disallowed store name: ${store || '(empty)'}`,
      code: 'INVALID_STORE',
    });
    return;
  }

  const pk = getSupabasePrimaryKey(store);

  if (action === 'pull') {
    try {
      const allRows: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await client
          .from(store)
          .select('*')
          .order(pk, { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          res.status(400).json({ success: false, error: error.message, code: error.code });
          return;
        }
        const batch = data || [];
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      res.status(200).json({ success: true, rows: allRows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Pull failed.' });
    }
    return;
  }

  if (action === 'upsert') {
    const rows = Array.isArray(parsed.body?.rows)
      ? parsed.body.rows
      : parsed.body?.row
      ? [parsed.body.row]
      : [];
    if (rows.length === 0) {
      res.status(400).json({ success: false, error: 'Missing row payload.' });
      return;
    }

    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const slice = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await client.from(store).upsert(slice, { onConflict: pk });
        if (error) {
          res.status(400).json({ success: false, error: error.message, code: error.code });
          return;
        }
      }
      res.status(200).json({ success: true, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Upsert failed.' });
    }
    return;
  }

  res.status(400).json({
    success: false,
    error: `Unsupported action: ${action || '(empty)'}`,
  });
}
