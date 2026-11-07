import { CreditEntry, Customer } from '@/lib/db/idb';
import { apiFetch } from '@/lib/api-client';

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
  async ping(): Promise<RedisHealth> {
    const start = Date.now();
    try {
      const res = await apiFetch('/api/utang-webhook?action=health');
      const data = await res.json().catch(() => ({}));
      const latency = Date.now() - start;
      return {
        connected: Boolean(res.ok && data?.success),
        ping: data?.ping || (res.ok ? 'PONG' : data?.error || 'FAILED'),
        latencyMs: typeof data?.latencyMs === 'number' ? data.latencyMs : latency,
        url: data?.redisHost || 'server-configured',
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return {
        connected: false,
        ping: err?.message || 'Connection failed',
        latencyMs: Date.now() - start,
        url: 'server-configured',
        timestamp: Date.now(),
      };
    }
  }

  async pushUtangRecord(entry: CreditEntry, customer?: Customer): Promise<boolean> {
    try {
      const response = await apiFetch('/api/utang-webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'push_record', entry, customer }),
      });
      return response.ok;
    } catch (err) {
      console.warn('[RedisService] Redis push skipped:', err);
      return false;
    }
  }

  async pullAllUtang(): Promise<{ entries: CreditEntry[]; summary: TabulatedRedisSummary }> {
    try {
      const res = await apiFetch('/api/utang-webhook?action=pull_all');
      if (res.ok) {
        const data = await res.json();
        return {
          entries: data.entries || [],
          summary: data.summary || { totalEntries: 0, activeRecords: 0, totalUtangReleased: 0, totalPaymentsCollected: 0, netReceivables: 0 },
        };
      }
    } catch (err) {
      console.warn('[RedisService] Redis pull failed:', err);
    }
    return { entries: [], summary: { totalEntries: 0, activeRecords: 0, totalUtangReleased: 0, totalPaymentsCollected: 0, netReceivables: 0 } };
  }

  async syncAllToRedis(entries: CreditEntry[], customers: Customer[]): Promise<{ success: boolean; count: number }> {
    try {
      const res = await apiFetch('/api/utang-webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'batch_push', entries, customers, note: 'Full Utang Ledger Tabulated Sync' }),
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, count: data.totalEntries || entries.length };
      }
    } catch (err) {
      console.warn('[RedisService] Redis batch push failed:', err);
    }
    return { success: false, count: 0 };
  }
}

export const upstashRedis = new UpstashRedisService();


