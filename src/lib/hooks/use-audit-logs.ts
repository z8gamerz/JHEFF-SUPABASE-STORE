'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuditLog } from '@/lib/db/idb';
import { auditService } from '@/lib/services/audit-service';

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [ttlDays, setTtlState] = useState<number>(() => auditService.getTTLRetentionDays());
  const [autoPurgeEnabled, setAutoPurgeState] = useState<boolean>(() => auditService.isAutoPurgeEnabled());
  const [isPurging, setIsPurging] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Auto-check TTL purge if due
      await auditService.checkAndAutoClean();
      
      const data = await auditService.getAll();
      setLogs(data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const updateTtlDays = (days: number) => {
    auditService.setTTLRetentionDays(days);
    setTtlState(days);
  };

  const updateAutoPurge = (enabled: boolean) => {
    auditService.setAutoPurgeEnabled(enabled);
    setAutoPurgeState(enabled);
  };

  const cleanExpiredNow = async (days?: number) => {
    setIsPurging(true);
    try {
      const result = await auditService.cleanExpiredLogs(days || ttlDays);
      await fetchLogs();
      return result;
    } finally {
      setIsPurging(false);
    }
  };

  return {
    logs,
    loading,
    ttlDays,
    setTtlDays: updateTtlDays,
    autoPurgeEnabled,
    setAutoPurgeEnabled: updateAutoPurge,
    cleanExpiredNow,
    isPurging,
    refresh: fetchLogs,
  };
}
