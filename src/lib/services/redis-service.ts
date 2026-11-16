import { CreditEntry, Customer } from '@/lib/db/idb';
import { apiFetch } from '@/lib/api-client';
import { roundCurrency } from '@/lib/utils/financial';

export interface RedisHealth {
  connected: boolean;
  configured?: boolean;
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

function emptySummary(): TabulatedRedisSummary {
  return {
    totalEntries: 0,
    activeRecords: 0,
    totalUtangReleased: 0,
    totalPaymentsCollected: 0,
    netReceivables: 0,
  };
}

export class UpstashRedisService {
  /**
   * Checks Upstash Redis connectivity via server-side /api/utang-webhook endpoint.
   */
  async ping(): Promise<RedisHealth> {
    const start = Date.now();
    try {
      const res = await apiFetch('/api/utang-webhook?action=health', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json().catch(() => ({}));
      const latency = typeof data?.latencyMs === 'number' ? data.latencyMs : Date.now() - start;

      if (data?.status === 'not_configured') {
        return {
          connected: false,
          configured: false,
          ping: 'NOT_CONFIGURED',
          latencyMs: 0,
          url: 'Not Configured',
          timestamp: Date.now(),
        };
      }

      if (res.ok && data?.success) {
        return {
          connected: true,
          configured: true,
          ping: data.ping || 'PONG',
          latencyMs: latency,
          url: data.redisHost || '',
          timestamp: Date.now(),
        };
      }

      return {
        connected: false,
        configured: data?.configured ?? true,
        ping: data?.error || `HTTP ${res.status}`,
        latencyMs: latency,
        url: data?.redisHost || '',
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return {
        connected: false,
        configured: false,
        ping: err?.message || 'Connection failed',
        latencyMs: Date.now() - start,
        url: '',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Pushes a single Utang credit/payment entry to Upstash Redis via authenticated API route.
   */
  async pushUtangRecord(entry: CreditEntry, customer?: Customer): Promise<boolean> {
    try {
      const response = await apiFetch('/api/utang-webhook', {
        method: 'POST',
        body: JSON.stringify({
          action: 'push_record',
          entry,
          customer,
        }),
      });
      return response.ok;
    } catch (err) {
      console.warn('[RedisService] Push skipped:', err);
      return false;
    }
  }

  /**
   * Pulls all tabulated Utang records via authenticated API route.
   */
  async pullAllUtang(): Promise<{ entries: CreditEntry[]; summary: TabulatedRedisSummary }> {
    try {
      const res = await apiFetch('/api/utang-webhook?action=pull_all');
      if (res.ok) {
        const data = await res.json();
        const rawSummary = data?.summary;
        return {
          entries: data.entries || [],
          summary: rawSummary
            ? {
                totalEntries: rawSummary.totalEntries || 0,
                activeRecords: rawSummary.activeRecords || 0,
                totalUtangReleased: roundCurrency(rawSummary.totalUtangReleased || 0),
                totalPaymentsCollected: roundCurrency(rawSummary.totalPaymentsCollected || 0),
                netReceivables: roundCurrency(rawSummary.netReceivables || 0),
              }
            : emptySummary(),
        };
      }
    } catch (err) {
      console.warn('[RedisService] Pull failed:', err);
    }

    return {
      entries: [],
      summary: emptySummary(),
    };
  }

  /**
   * Batch syncs all local customer credit records to Upstash Redis via authenticated API route.
   */
  async syncAllToRedis(entries: CreditEntry[], customers: Customer[]): Promise<{ success: boolean; count: number }> {
    try {
      const res = await apiFetch('/api/utang-webhook', {
        method: 'POST',
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
      console.warn('[RedisService] Batch push failed:', err);
    }

    return { success: false, count: 0 };
  }
}

export const upstashRedis = new UpstashRedisService();
