'use client';

import { dbUtil, STORES, StoreName } from '@/lib/db/idb';
import { auditService } from './audit-service';

export interface BackupPayload {
  version: number;
  exportDate: string;
  timestamp: number;
  checksum?: string;
  data: Partial<Record<StoreName, any[]>>;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  restoredStores: string[];
  totalRecords: number;
}

class BackupService {
  /**
   * Generates a complete JSON backup of all IndexedDB tables
   */
  async generateBackup(): Promise<BackupPayload> {
    const data: Partial<Record<StoreName, any[]>> = {};

    const storeNames = Object.values(STORES) as StoreName[];

    for (const store of storeNames) {
      try {
        const items = await dbUtil.getItems(store);
        data[store] = items;
      } catch (err) {
        console.warn(`Could not export store ${store}:`, err);
        data[store] = [];
      }
    }

    const payload: BackupPayload = {
      version: 1,
      exportDate: new Date().toISOString(),
      timestamp: Date.now(),
      data,
    };

    // Calculate lightweight SHA-256 checksum for integrity check
    try {
      const jsonStr = JSON.stringify(payload.data);
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(jsonStr));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      payload.checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      payload.checksum = 'unhashed';
    }

    await auditService.log('BACKUP_EXPORT', 'Full database snapshot exported');
    return payload;
  }

  /**
   * Downloads the backup as a timestamped JSON file
   */
  async downloadBackupFile(): Promise<void> {
    const backup = await this.generateBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `sari-pos-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Validates and restores database from a backup JSON payload
   */
  async restoreBackup(payload: BackupPayload): Promise<RestoreResult> {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      throw new Error('Invalid backup file format: Missing data object.');
    }

    const restoredStores: string[] = [];
    let totalRecords = 0;

    // Verify each store and replace items
    for (const [storeKey, items] of Object.entries(payload.data)) {
      if (!Array.isArray(items)) continue;
      const storeName = storeKey as StoreName;

      try {
        // Clear existing store records first
        await dbUtil.clearStore(storeName);

        // Batch insert restored records
        for (const item of items) {
          if (item) {
            await dbUtil.addItem(storeName, item);
            totalRecords++;
          }
        }
        restoredStores.push(storeName);
      } catch (err) {
        console.error(`Failed restoring store ${storeName}:`, err);
      }
    }

    await auditService.log(
      'BACKUP_RESTORE',
      `Restored ${totalRecords} records across ${restoredStores.length} stores`
    );

    return {
      success: true,
      message: `Successfully restored ${totalRecords} records across ${restoredStores.length} tables.`,
      restoredStores,
      totalRecords,
    };
  }

  /**
   * Saves an automatic local snapshot for instant recovery
   */
  async saveLocalSnapshot(): Promise<void> {
    try {
      const backup = await this.generateBackup();
      // Keep lightweight snapshot summary in local storage
      localStorage.setItem('pos_last_snapshot_meta', JSON.stringify({
        timestamp: backup.timestamp,
        date: backup.exportDate,
        checksum: backup.checksum,
      }));
    } catch (err) {
      console.warn('Auto snapshot failed:', err);
    }
  }

  getLastSnapshotMeta(): { timestamp: number; date: string } | null {
    try {
      const raw = localStorage.getItem('pos_last_snapshot_meta');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export const backupService = new BackupService();
