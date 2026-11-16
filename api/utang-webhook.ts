import { Redis } from '@upstash/redis';
import { applyApiGuards, parseJsonBody, requireEnv } from './_security.js';

function getRedisConfig(): { url: string; token: string; client: Redis | null } {
  const url = requireEnv('UPSTASH_REDIS_REST_URL');
  const token = requireEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    return { url: '', token: '', client: null };
  }
  return {
    url,
    token,
    client: new Redis({ url, token }),
  };
}

export default async function handler(req: any, res: any) {
  if (
    !applyApiGuards(req, res, {
      methods: 'GET, POST, OPTIONS',
      rateKey: 'utang-webhook',
      rateLimitMax: 60,
      maxBodyBytes: 1024 * 1024,
      requireAuth: true,
    })
  ) {
    return;
  }

  const { url: redisUrl, client: redis } = getRedisConfig();

  if (req.method === 'GET') {
    const parsedUrl = new URL(req.url || '/api/utang-webhook', 'http://localhost');
    const action = parsedUrl.searchParams.get('action') || 'pull_all';
    const customerId = parsedUrl.searchParams.get('customerId');

    if (!redis || !redisUrl) {
      if (action === 'health' || action === 'ping') {
        return res.status(200).json({
          success: false,
          configured: false,
          status: 'not_configured',
          error: 'Upstash Redis is not configured.',
          timestamp: Date.now(),
        });
      }
      return res.status(503).json({
        success: false,
        configured: false,
        error: 'Upstash Redis is not configured (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).',
      });
    }

    try {
      if (action === 'health' || action === 'ping') {
        const start = Date.now();
        const pingRes = await redis.ping();
        const latency = Date.now() - start;
        return res.status(200).json({
          success: true,
          configured: true,
          status: 'connected',
          ping: pingRes,
          latencyMs: latency,
          redisHost: new URL(redisUrl).hostname,
          timestamp: Date.now(),
        });
      }

      if (action === 'pull_customer' && customerId) {
        const entryIds = await redis.zrange(`utang:customer:${customerId}:entries`, 0, -1, { rev: true });
        let entries: any[] = [];
        if (entryIds && entryIds.length > 0) {
          const keys = entryIds.map((id) => `utang:entry:${id}`);
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

      const entryIds = await redis.zrange('utang:entries:by_time', 0, 1000, { rev: true });
      const entries: any[] = [];

      if (entryIds && entryIds.length > 0) {
        const keys = entryIds.map((id) => `utang:entry:${id}`);
        const chunkSize = 50;
        for (let i = 0; i < keys.length; i += chunkSize) {
          const chunk = keys.slice(i, i + chunkSize);
          const chunkResults = await redis.mget(...chunk);
          for (const item of chunkResults) {
            if (item) entries.push(item);
          }
        }
      }

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
        redisHost: new URL(redisUrl).hostname,
        summary: {
          totalEntries: entries.length,
          activeRecords: activeCount,
          totalUtangReleased: Math.round(totalUtang * 100) / 100,
          totalPaymentsCollected: Math.round(totalPayments * 100) / 100,
          netReceivables,
        },
        entries,
        pulledAt: Date.now(),
      });
    } catch (err: any) {
      console.error('[Utang Webhook GET Error]:', err?.message || err);
      return res.status(500).json({
        success: false,
        error: 'Failed to pull Utang records from Upstash Redis.',
      });
    }
  }

  if (req.method === 'POST') {
    if (!redis || !redisUrl) {
      return res.status(503).json({
        success: false,
        configured: false,
        error: 'Upstash Redis is not configured (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).',
      });
    }

    const parsed = await parseJsonBody(req, 1024 * 1024);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ success: false, error: parsed.error });
    }

    try {
      const body = parsed.body;
      const { action = 'push_record', entry, customer, entries, customers, note } = body;

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
          syncedToRedisAt: now,
        };

        const pipe = redis.pipeline();
        pipe.set(`utang:entry:${entry.id}`, enrichedEntry);
        pipe.zadd('utang:entries:by_time', {
          score: enrichedEntry.timestamp,
          member: entry.id,
        });

        if (entry.customerId) {
          pipe.zadd(`utang:customer:${entry.customerId}:entries`, {
            score: enrichedEntry.timestamp,
            member: entry.id,
          });
        }

        if (customer && customer.id) {
          pipe.set(`utang:customer:${customer.id}:profile`, {
            ...customer,
            updatedAt: now,
            lastSyncedAt: now,
          });
        }

        pipe.lpush('utang:webhook:logs', {
          event: 'PUSH_RECORD',
          entryId: entry.id,
          customerId: entry.customerId,
          type: entry.type,
          amount: entry.amount,
          description: entry.description,
          timestamp: now,
        });
        pipe.ltrim('utang:webhook:logs', 0, 99);

        await pipe.exec();

        return res.status(200).json({
          success: true,
          message: 'Utang record successfully pushed to Upstash Redis DB via Webhook.',
          entryId: entry.id,
          syncedAt: now,
        });
      }

      if (action === 'batch_push') {
        const entriesList = Array.isArray(entries) ? entries : [];
        const customersList = Array.isArray(customers) ? customers : [];

        if (entriesList.length === 0 && customersList.length === 0) {
          return res.status(400).json({ success: false, error: 'No entries or customers provided for batch push.' });
        }

        const now = Date.now();
        const pipe = redis.pipeline();

        for (const item of entriesList) {
          if (!item.id) continue;
          const enriched = {
            ...item,
            amount: Number(item.amount),
            timestamp: item.timestamp || now,
            updatedAt: now,
            isDeleted: item.isDeleted ?? false,
            syncedToRedisAt: now,
          };

          pipe.set(`utang:entry:${item.id}`, enriched);
          pipe.zadd('utang:entries:by_time', {
            score: enriched.timestamp,
            member: item.id,
          });

          if (item.customerId) {
            pipe.zadd(`utang:customer:${item.customerId}:entries`, {
              score: enriched.timestamp,
              member: item.id,
            });
          }
        }

        for (const cust of customersList) {
          if (!cust.id) continue;
          pipe.set(`utang:customer:${cust.id}:profile`, {
            ...cust,
            lastSyncedAt: now,
          });
        }

        pipe.lpush('utang:webhook:logs', {
          event: 'BATCH_PUSH',
          totalEntries: entriesList.length,
          totalCustomers: customersList.length,
          timestamp: now,
          note: note || 'Full batch sync to Upstash Redis',
        });
        pipe.ltrim('utang:webhook:logs', 0, 99);

        await pipe.exec();

        return res.status(200).json({
          success: true,
          message: `Batch push completed: ${entriesList.length} Utang records and ${customersList.length} customers stored in Upstash Redis.`,
          totalEntries: entriesList.length,
          totalCustomers: customersList.length,
          syncedAt: now,
        });
      }

      if (action === 'delete_record') {
        const { entryId, customerId } = body;
        if (!entryId) {
          return res.status(400).json({ success: false, error: 'entryId is required for delete.' });
        }

        const pipe = redis.pipeline();
        const existing: any = await redis.get(`utang:entry:${entryId}`);
        if (existing) {
          pipe.set(`utang:entry:${entryId}`, {
            ...existing,
            isDeleted: true,
            updatedAt: Date.now(),
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
          entryId,
        });
      }

      return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    } catch (err: any) {
      console.error('[Utang Webhook POST Error]:', err?.message || err);
      return res.status(500).json({
        success: false,
        error: 'Failed to push Utang data to Upstash Redis.',
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
