/**
 * High-Performance In-Memory & TTL Calculation Cache
 * Optimizes heavy computations such as credit cross-matching, daily report analytics,
 * and inventory aggregations to guarantee 60fps UI performance.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;
  private maxEntries: number;

  constructor(defaultTtlMs: number = 30000, maxEntries: number = 100) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Global caches for application hot paths
export const reportCache = new MemoryCache<any>(45000, 50); // 45 seconds TTL
export const ledgerCache = new MemoryCache<any>(30000, 50); // 30 seconds TTL
