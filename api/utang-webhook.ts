import { Redis } from '@upstash/redis';
import { applyCors, requireEnv, requireApiAuth, rateLimit, clampBodySize } from './_security';

function cleanEnv(val?: string): string {
  if (!val) return '';
  return String(val).replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = cleanEnv(requireEnv('UPSTASH_REDIS_REST_URL', 'VITE_UPSTASH_REDIS_REST_URL'));
  const token = cleanEnv(requireEnv('UPSTASH_REDIS_REST_TOKEN', 'VITE_UPSTASH_REDIS_REST_TOKEN'));
  if (!url || !token) return null;
  return { url, token };
}

function getRedisClient(): Redis {
  const cfg = getRedisConfig();
  if (!cfg) {
    throw new Error('Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN on the server.');
  }
  return new Redis({ url: cfg.url, token: cfg.token });
}

async function parseBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  if (req.readable && !req.complete) {
    return new Promise((resolve) => {
      let data = '';
      const timer = setTimeout(() => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      }, 2000);

      req.on('data', (chunk: any) => { data += chunk; });
      req.on('end', () => {
        clearTimeout(timer);
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve({});
      });
    });
  }

  return {};
}

export default async function handler(req: any, res: any) {
  if (!applyCors(req, res, 'GET, POST, OPTIONS', 'Content-Type, Authorization, X-POS-API-Key')) return;
  if (req.method === 'OPTIONS') return res.status(200).json({ success: true });
  if (!rateLimit(req, res, { key: 'utang-webhook', limit: 120, windowMs: 60_000 })) return;
  if (!requireApiAuth(req, res)) return;

  const cfg = getRedisConfig();
  if (!cfg) {
    return res.status(503).json({
      success: false,
      error: 'Server Redis configuration missing. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    });
  }
  const redis = getRedisClient();

  // 1. GET Requests: Pull out tabulated Utang records or check health
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'pull_all';
    const customerId = url.searchParams.get('customerId');

    try {
      // Health check & Connection Ping
      if (action === 'health' || action === 'ping') {
        const start = Date.now();
        const pingRes = await redis.ping();
        const latency = Date.now() - start;
        return res.status(200).json({
          success: true,
          status: 'connected',
          ping: pingRes,
          latencyMs: latency,
          redisHost: new URL(cfg.url).hostname,
          timestamp: Date.now()
        });
      }

      // Pull customer-specific tabulated ledger
      if (action === 'pull_customer' && customerId) {
        const entryIds = await redis.zrange(`utang:customer:${customerId}:entries`, 0, -1, { rev: true });
        let entries: any[] = [];
        if (entryIds && entryIds.length > 0) {
          const keys = entryIds.map(id => `utang:entry:${id}`);
          const rawEntries = await redis.mget(...keys);
          entries = rawEntries.filter(Boolean);
        }

        const profile = await redis.get(`utang:customer:${customerId}:profile`);

        return res.status(200).json({
          success: true,
          customerId,
          profile,
          totalEntries: entries.length,
          entries,
        });
      }

      // Default: Pull all tabulated Utang records from Redis
      // Fetch entry IDs sorted by timestamp (newest first)
      const entryIds = await redis.zrange('utang:entries:by_time', 0, 1000, { rev: true });
      let entries: any[] = [];

      if (entryIds && entryIds.length > 0) {
        const keys = entryIds.map(id => `utang:entry:${id}`);
        // Fetch in batches of 50 to avoid request size limits
        const chunkSize = 50;
        for (let i = 0; i < keys.length; i += chunkSize) {
          const chunk = keys.slice(i, i + chunkSize);
          const chunkResults = await redis.mget(...chunk);
          for (const item of chunkResults) {
            if (item) {
              entries.push(item);
            }
          }
        }
      }

      // Calculate Tabulated Summary Metrics
      let totalUtang = 0;
      let totalPayments = 0;
      let activeCount = 0;

      for (const e of entries) {
        if (e.isDeleted) continue;
        const amt = Math.abs(Number(e.amount) || 0);
        if (e.type === 'credit') {
          totalUtang += amt;
        } else if (e.type === 'payment') {
          totalPayments += amt;
        }
        activeCount++;
      }

      const netReceivables = Math.max(0, Math.round((totalUtang - totalPayments) * 100) / 100);

      return res.status(200).json({
        success: true,
        source: 'Upstash Redis',
        redisHost: new URL(cfg.url).hostname,
        summary: {
          totalEntries: entries.length,
          activeRecords: activeCount,
          totalUtangReleased: Math.round(totalUtang * 100) / 100,
          totalPaymentsCollected: Math.round(totalPayments * 100) / 100,
          netReceivables,
        },
        entries,
        pulledAt: Date.now()
      });
    } catch (err: any) {
      console.error('[Utang Webhook GET Error]:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to pull Utang records from Upstash Redis.',
      });
    }
  }

  // 2. POST Requests: Push data directly to Upstash Redis via Webhook
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!clampBodySize(body, 1_000_000)) {
        return res.status(413).json({ success: false, error: 'Request body too large.' });
      }
      const { action = 'push_record', entry, customer, entries, customers, note } = body;

      // Single Record Push
      if (action === 'push_record') {
        if (!entry || !entry.id) {
          return res.status(400).json({ success: false, error: 'Missing entry or entry.id in payload.' });
        }

        const now = Date.now();
        const enrichedEntry = {
          ...entry,
          amount: Number(entry.amount),
          timestamp: entry.timestamp || now,
          updatedAt: now,
          isDeleted: entry.isDeleted ?? false,
          syncedToRedisAt: now
        };

        const pipe = redis.pipeline();

        // 1. Store full entry document
        pipe.set(`utang:entry:${entry.id}`, enrichedEntry);

        // 2. Index into global timeline sorted set (score = timestamp)
        pipe.zadd('utang:entries:by_time', {
          score: enrichedEntry.timestamp,
          member: entry.id
        });

        // 3. Index into customer-specific timeline
        if (entry.customerId) {
          pipe.zadd(`utang:customer:${entry.customerId}:entries`, {
            score: enrichedEntry.timestamp,
            member: entry.id
          });
        }

        // 4. Update customer profile in Redis if provided
        if (customer && customer.id) {
          pipe.set(`utang:customer:${customer.id}:profile`, {
            ...customer,
            updatedAt: now,
            lastSyncedAt: now
          });
        }

        // 5. Append to Webhook audit log
        pipe.lpush('utang:webhook:logs', {
          event: 'PUSH_RECORD',
          entryId: entry.id,
          customerId: entry.customerId,
          type: entry.type,
          amount: entry.amount,
          description: entry.description,
          timestamp: now
        });
        pipe.ltrim('utang:webhook:logs', 0, 99); // Keep latest 100 logs

        await pipe.exec();

        return res.status(200).json({
          success: true,
          message: 'Utang record successfully pushed to Upstash Redis DB via Webhook.',
          entryId: entry.id,
          syncedAt: now
        });
      }

      // Batch Push: Bulk sync all customer credit entries into Redis
      if (action === 'batch_push') {
        const entriesList = Array.isArray(entries) ? entries : [];
        const customersList = Array.isArray(customers) ? customers : [];

        if (entriesList.length === 0 && customersList.length === 0) {
          return res.status(400).json({ success: false, error: 'No entries or customers provided for batch push.' });
        }

        const now = Date.now();
        const pipe = redis.pipeline();

        // Push all credit entries
        for (const item of entriesList) {
          if (!item.id) continue;
          const enriched = {
            ...item,
            amount: Number(item.amount),
            timestamp: item.timestamp || now,
            updatedAt: now,
            isDeleted: item.isDeleted ?? false,
            syncedToRedisAt: now
          };

          pipe.set(`utang:entry:${item.id}`, enriched);
          pipe.zadd('utang:entries:by_time', {
            score: enriched.timestamp,
            member: item.id
          });

          if (item.customerId) {
            pipe.zadd(`utang:customer:${item.customerId}:entries`, {
              score: enriched.timestamp,
              member: item.id
            });
          }
        }

        // Push all customer profiles
        for (const cust of customersList) {
          if (!cust.id) continue;
          pipe.set(`utang:customer:${cust.id}:profile`, {
            ...cust,
            lastSyncedAt: now
          });
        }

        // Audit Log entry
        pipe.lpush('utang:webhook:logs', {
          event: 'BATCH_PUSH',
          totalEntries: entriesList.length,
          totalCustomers: customersList.length,
          timestamp: now,
          note: note || 'Full batch sync to Upstash Redis'
        });
        pipe.ltrim('utang:webhook:logs', 0, 99);

        await pipe.exec();

        return res.status(200).json({
          success: true,
          message: `Batch push completed: ${entriesList.length} Utang records and ${customersList.length} customers stored in Upstash Redis.`,
          totalEntries: entriesList.length,
          totalCustomers: customersList.length,
          syncedAt: now
        });
      }

      // Delete Record
      if (action === 'delete_record') {
        const { entryId, customerId } = body;
        if (!entryId) {
          return res.status(400).json({ success: false, error: 'entryId is required for delete.' });
        }

        const pipe = redis.pipeline();
        // Mark as isDeleted
        const existing: any = await redis.get(`utang:entry:${entryId}`);
        if (existing) {
          pipe.set(`utang:entry:${entryId}`, {
            ...existing,
            isDeleted: true,
            updatedAt: Date.now()
          });
        }

        if (customerId) {
          pipe.zrem(`utang:customer:${customerId}:entries`, entryId);
        }
        pipe.zrem('utang:entries:by_time', entryId);

        await pipe.exec();

        return res.status(200).json({
          success: true,
          message: `Record ${entryId} deleted from active Redis index.`,
          entryId
        });
      }

      return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    } catch (err: any) {
      console.error('[Utang Webhook POST Error]:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to push Utang data to Upstash Redis.',
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
