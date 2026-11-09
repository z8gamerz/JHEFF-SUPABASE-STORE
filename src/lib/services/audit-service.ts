'use client';

import { BaseService } from './base-service';
import { AuditLog, STORES, dbUtil } from '@/lib/db/idb';
import { pushDirect } from '@/lib/db/sync-queue';

export const DEFAULT_AUDIT_TTL_DAYS = 30;

class AuditService extends BaseService<AuditLog> {
  constructor() {
    super(STORES.AUDIT_LOGS);
  }

  /**
   * Retrieves the current Audit Log TTL retention in days.
   * Default: 30 days (saves database storage space).
   */
  getTTLRetentionDays(): number {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('audit_logs_ttl_days');
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return DEFAULT_AUDIT_TTL_DAYS;
  }

  /**
   * Sets the Audit Log TTL retention in days.
   */
  setTTLRetentionDays(days: number): void {
    if (typeof window !== 'undefined') {
      const clamped = Math.max(1, Math.min(365, days));
      localStorage.setItem('audit_logs_ttl_days', String(clamped));
    }
  }

  /**
   * Checks if automated TTL pruning on load is enabled.
   */
  isAutoPurgeEnabled(): boolean {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('audit_logs_auto_purge');
      if (val !== null) return val === 'true';
    }
    return true; // Enabled by default to prevent database bloat
  }

  /**
   * Toggles automated TTL pruning.
   */
  setAutoPurgeEnabled(enabled: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('audit_logs_auto_purge', String(enabled));
    }
  }

  /**
   * Cleans up audit logs older than the specified retention days.
   * Purges them from both local IndexedDB and cloud RTDB.
   */
  async cleanExpiredLogs(customRetentionDays?: number): Promise<{
    deletedCount: number;
    remainingCount: number;
    cutoffTimestamp: number;
  }> {
    const retentionDays = customRetentionDays || this.getTTLRetentionDays();
    const cutoffTimestamp = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    try {
      const allLogs = await dbUtil.getItems<AuditLog>(STORES.AUDIT_LOGS);
      const expiredLogs = allLogs.filter(log => {
        if (!log || !log.id) return false;
        const time = log.timestamp || log.updatedAt || 0;
        return time > 0 && time < cutoffTimestamp;
      });

      let deletedCount = 0;
      for (const log of expiredLogs) {
        try {
          await dbUtil.deleteItem(STORES.AUDIT_LOGS, log.id);
          // Trigger cloud purge
          await pushDirect(STORES.AUDIT_LOGS, log.id, null, true).catch(() => {});
          deletedCount++;
        } catch (e) {
          console.warn('[AuditService] Failed to delete expired log item:', log.id, e);
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('audit_logs_last_cleanup', String(Date.now()));
      }

      const remainingCount = Math.max(0, allLogs.length - deletedCount);
      return {
        deletedCount,
        remainingCount,
        cutoffTimestamp,
      };
    } catch (err) {
      console.error('[AuditService] Error during TTL cleanup:', err);
      return {
        deletedCount: 0,
        remainingCount: 0,
        cutoffTimestamp,
      };
    }
  }

  /**
   * Throttled automated cleanup (runs at most once every 6 hours)
   */
  async checkAndAutoClean(): Promise<number> {
    if (!this.isAutoPurgeEnabled()) return 0;
    
    if (typeof window !== 'undefined') {
      const last = localStorage.getItem('audit_logs_last_cleanup');
      const now = Date.now();
      if (last) {
        const lastTime = parseInt(last, 10);
        // Only run auto-cleanup if more than 6 hours have passed since last cleanup
        if (!isNaN(lastTime) && (now - lastTime) < 6 * 60 * 60 * 1000) {
          return 0;
        }
      }
    }

    const res = await this.cleanExpiredLogs();
    return res.deletedCount;
  }

  async log(action: string, details: string, user?: string) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const log: AuditLog = {
      id,
      action,
      details,
      user,
      timestamp: now,
      updatedAt: now,
      isDeleted: false,
    };
    
    try {
      await this.create(log);
      // Run background non-blocking check
      this.checkAndAutoClean().catch(() => {});
    } catch (error) {
      console.error('Failed to log audit:', error);
    }
  }
}

export const auditService = new AuditService();

