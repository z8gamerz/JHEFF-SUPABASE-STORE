'use client';

/**
 * Client-Side & Edge Rate Limiter
 * Provides sliding-window and token-bucket rate limiting for authentication attempts,
 * sensitive ledger actions (balance deletion), and high-frequency transactions.
 */

interface RateLimitRecord {
  count: number;
  firstAttempt: number;
  lockedUntil: number;
}

const STORAGE_PREFIX = 'pos_rate_limit_';

export class RateLimiter {
  private key: string;
  private maxAttempts: number;
  private windowMs: number;
  private lockoutMs: number;

  constructor(key: string, maxAttempts: number = 5, windowMs: number = 60000, lockoutMs: number = 60000) {
    this.key = `${STORAGE_PREFIX}${key}`;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;
  }

  private getRecord(): RateLimitRecord {
    if (typeof window === 'undefined') {
      return { count: 0, firstAttempt: 0, lockedUntil: 0 };
    }
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { count: 0, firstAttempt: 0, lockedUntil: 0 };
      return JSON.parse(raw);
    } catch {
      return { count: 0, firstAttempt: 0, lockedUntil: 0 };
    }
  }

  private saveRecord(record: RateLimitRecord): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.key, JSON.stringify(record));
    } catch (e) {
      console.warn('Failed to save rate limit record:', e);
    }
  }

  /**
   * Checks whether the current action is allowed or currently locked out.
   */
  isAllowed(): { allowed: boolean; remainingAttempts: number; lockoutSeconds: number } {
    const now = Date.now();
    const record = this.getRecord();

    // Check if currently locked out
    if (record.lockedUntil > now) {
      const lockoutSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, lockoutSeconds };
    }

    // Check if the sliding window expired
    if (record.firstAttempt && now - record.firstAttempt > this.windowMs) {
      return { allowed: true, remainingAttempts: this.maxAttempts, lockoutSeconds: 0 };
    }

    const remaining = Math.max(0, this.maxAttempts - record.count);
    return { allowed: remaining > 0, remainingAttempts: remaining, lockoutSeconds: 0 };
  }

  /**
   * Records a failed attempt. If threshold is exceeded, triggers lockout.
   */
  recordFailure(): { allowed: boolean; remainingAttempts: number; lockoutSeconds: number } {
    const now = Date.now();
    let record = this.getRecord();

    // If window expired, reset
    if (!record.firstAttempt || now - record.firstAttempt > this.windowMs) {
      record = { count: 1, firstAttempt: now, lockedUntil: 0 };
    } else {
      record.count += 1;
    }

    // Trigger lockout if count >= maxAttempts
    if (record.count >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutMs;
      this.saveRecord(record);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutSeconds: Math.ceil(this.lockoutMs / 1000),
      };
    }

    this.saveRecord(record);
    return {
      allowed: true,
      remainingAttempts: Math.max(0, this.maxAttempts - record.count),
      lockoutSeconds: 0,
    };
  }

  /**
   * Resets rate limiter after successful action (e.g. successful login)
   */
  reset(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(this.key);
    } catch {}
  }
}

// Pre-configured rate limiters
export const authRateLimiter = new RateLimiter('auth_login', 5, 60000, 60000); // 5 attempts per min, 60s lockout
export const balanceDeleteRateLimiter = new RateLimiter('balance_delete', 5, 10000, 15000); // 5 deletes per 10s
