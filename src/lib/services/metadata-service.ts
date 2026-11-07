'use client';

import { dbUtil, STORES } from '@/lib/db/idb';
import { syncDb } from '@/lib/db/sync-queue';

export type MetadataEntry = {
  key: string;
  value: string;
  updatedAt: number;
  isDeleted?: boolean;
};

const SENSITIVE_METADATA_KEYS = new Set([
  'email_smtp_password',
  'firebase_database_secret',
  'upstash_redis_rest_token',
]);

export function isSensitiveMetadataKey(key: string): boolean {
  return SENSITIVE_METADATA_KEYS.has(key);
}

class MetadataService {
  private storeName = STORES.METADATA;

  async get(key: string): Promise<MetadataEntry | undefined> {
    const item = await dbUtil.getItemById<MetadataEntry>(this.storeName, key);
    if (item?.isDeleted) return undefined;
    return item;
  }

  async set(key: string, value: string): Promise<string | number> {
    const now = Date.now();
    const entry: MetadataEntry = {
      key,
      value,
      updatedAt: now,
      isDeleted: false,
    };

    // Sensitive values are stored locally only and never cloud-synced.
    if (isSensitiveMetadataKey(key)) {
      return await dbUtil.updateItem(this.storeName, entry);
    }
    return await syncDb.update(this.storeName, entry);
  }

  async delete(key: string): Promise<void> {
    if (isSensitiveMetadataKey(key)) {
      await dbUtil.deleteItem(this.storeName, key);
      return;
    }
    await syncDb.delete(this.storeName, key);
  }
}

export const metadataService = new MetadataService();

