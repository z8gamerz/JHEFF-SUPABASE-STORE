import { Redis } from '@upstash/redis';
import { CreditEntry, Customer } from '@/lib/db/idb';

const rawUrl = (import.meta as any).env?.VITE_UPSTASH_REDIS_REST_URL || 'https://proper-gull-192572.upstash.io';
const UPSTASH_URL = String(rawUrl).replace(/^["'\s]+|["'\s]+$/g, '').trim();

const rawToken = (import.meta as any).env?.VITE_UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAvA8AAIgcDIxMjExNWU2ZTczZDg0ZmIxOWZjZTJkNWM0MzQyNTM2Mg';
const UPSTASH_TOKEN = String(rawToken).replace(/^["'\s]+|["'\s]+$/g, '').trim();

export interface RedisHealth {
  connected: boolean;
  ping: string;
  latencyMs: number;
  url: string;
  timestamp: number;
}

export interface TabulatedRedisSummary {
  totalEntries: number;
  activeRecords: number;
  totalUtangReleased: number;
  totalPaymentsCollected: number;
  netReceivables: number;
}

export class UpstashRedisService {
  private client: Redis | null = null;

  public getClient(): Redis {
    if (!this.client) {
      this.client = new Redis({
        url: UPSTASH_URL,
        token: UPSTASH_TOKEN,
      });
    }
    return this.client;
  }

  /**
   * Tests connection to Upstash Redis
   */
  async ping(): Promise<RedisHealth> {
    const start = Date.now();
    try {
      const redis = this.getClient();
      const res = await redis.ping();
      const latency = Date.now() - start;
      return {
        connected: res === 'PONG',
        ping: res,
        latencyMs: latency,
        url: new URL(UPSTASH_URL).hostname,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return {
        connected: false,
        ping: err?.message || 'Connection failed',
        latencyMs: Date.now() - start,
        url: UPSTASH_URL,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Pushes a single Utang credit/payment entry to Upstash Redis directly via webhook helper
   */
  async pushUtangRecord(entry: CreditEntry, customer?: Customer): Promise<boolean> {
    try {
      // 1. Send via local Webhook helper endpoint
      const response = await fetch('/api/utang-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_record',
          entry,
          customer,
        }),
      });

      if (response.ok) {
        return true;
      }
    } catch (err) {
      console.warn('[RedisService] Webhook helper fallback to direct Redis SDK:', err);
    }

    // Direct fallback via Redis SDK
    try {
      const redis = this.getClient();
      const enriched = {
        ...entry,
        amount: Number(entry.amount),
        syncedToRedisAt: Date.now(),
      };
      await redis.set(`utang:entry:${entry.id}`, enriched);
      await redis.zadd('utang:entries:by_time', {
        score: entry.timestamp || Date.now(),
        member: entry.id,
      });
      if (entry.customerId) {
        await redis.zadd(`utang:customer:${entry.customerId}:entries`, {
          score: entry.timestamp || Date.now(),
          member: entry.id,
        });
      }
      return true;
    } catch (e) {
      console.error('[RedisService] Failed direct Redis push:', e);
      return false;
    }
  }

  /**
   * Pulls all tabulated Utang records from Upstash Redis
   */
  async pullAllUtang(): Promise<{ entries: CreditEntry[]; summary: TabulatedRedisSummary }> {
    try {
      const res = await fetch('/api/utang-webhook?action=pull_all');
      if (res.ok) {
        const data = await res.json();
        return {
          entries: data.entries || [],
          summary: data.summary || {
            totalEntries: 0,
            activeRecords: 0,
            totalUtangReleased: 0,
            totalPaymentsCollected: 0,
            netReceivables: 0,
          },
        };
      }
    } catch (err) {
      console.warn('[RedisService] Webhook helper pull fallback:', err);
    }

    // Direct SDK fallback
    const redis = this.getClient();
    const entryIds = await redis.zrange('utang:entries:by_time', 0, 1000, { rev: true });
    let entries: CreditEntry[] = [];
    if (entryIds && entryIds.length > 0) {
      const keys = entryIds.map((id) => `utang:entry:${id}`);
      const raw = await redis.mget<CreditEntry[]>(...keys);
      entries = raw.filter(Boolean);
    }

    let totalUtang = 0;
    let totalPayments = 0;
    let activeRecords = 0;

    for (const e of entries) {
      if (e.isDeleted) continue;
      const amt = Math.abs(Number(e.amount) || 0);
      if (e.type === 'credit') totalUtang += amt;
      else if (e.type === 'payment') totalPayments += amt;
      activeRecords++;
    }

    return {
      entries,
      summary: {
        totalEntries: entries.length,
        activeRecords,
        totalUtangReleased: Math.round(totalUtang * 100) / 100,
        totalPaymentsCollected: Math.round(totalPayments * 100) / 100,
        netReceivables: Math.max(0, Math.round((totalUtang - totalPayments) * 100) / 100),
      },
    };
  }

  /**
   * Batch syncs all local customer credit records to Upstash Redis
   */
  async syncAllToRedis(entries: CreditEntry[], customers: Customer[]): Promise<{ success: boolean; count: number }> {
    try {
      const res = await fetch('/api/utang-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_push',
          entries,
          customers,
          note: 'Full Utang Ledger Tabulated Sync',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return { success: true, count: data.totalEntries || entries.length };
      }
    } catch (err) {
      console.warn('[RedisService] Webhook batch push failed, using SDK direct pipeline:', err);
    }

    // Direct SDK fallback
    const redis = this.getClient();
    const pipe = redis.pipeline();
    const now = Date.now();

    for (const item of entries) {
      if (!item.id) continue;
      pipe.set(`utang:entry:${item.id}`, { ...item, syncedToRedisAt: now });
      pipe.zadd('utang:entries:by_time', {
        score: item.timestamp || now,
        member: item.id,
      });
      if (item.customerId) {
        pipe.zadd(`utang:customer:${item.customerId}:entries`, {
          score: item.timestamp || now,
          member: item.id,
        });
      }
    }

    for (const c of customers) {
      if (!c.id) continue;
      pipe.set(`utang:customer:${c.id}:profile`, { ...c, lastSyncedAt: now });
    }

    await pipe.exec();
    return { success: true, count: entries.length };
  }
}

export const upstashRedis = new UpstashRedisService();
