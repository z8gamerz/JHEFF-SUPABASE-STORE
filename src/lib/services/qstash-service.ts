'use client';

import { apiFetch } from '@/lib/api-client';

export interface QStashStatus {
  connected: boolean;
  configured: boolean;
  baseUrl: string;
  tokenMasked: string;
  signingKeys?: {
    current: string;
    next: string;
    configured: boolean;
  };
  status: string;
  timestamp?: number;
}

export interface QStashPublishParams {
  url?: string;
  body?: any;
  delay?: string; // e.g. "10s", "5m", "1d"
  cron?: string;  // e.g. "0 9 * * 1" (every Monday 9am)
  headers?: Record<string, string>;
}

export interface QStashPublishResult {
  success: boolean;
  message?: string;
  messageId?: string;
  url?: string;
  error?: string;
  publishedAt?: number;
}

class QStashService {
  /**
   * Retrieves connection status with automatically masked token from server API.
   */
  async getStatus(): Promise<QStashStatus> {
    try {
      const res = await apiFetch('/api/qstash', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const isConfigured = Boolean(data.configured);
        return {
          connected: isConfigured && Boolean(data.connected ?? true),
          configured: isConfigured,
          baseUrl: data.baseUrl || '',
          tokenMasked: data.tokenMasked || (isConfigured ? 'Configured' : 'Not Configured'),
          signingKeys: data.signingKeys,
          status: data.status || (isConfigured ? 'Active & Connected' : 'Not Configured'),
          timestamp: data.timestamp || Date.now(),
        };
      }
      return {
        connected: false,
        configured: false,
        baseUrl: '',
        tokenMasked: 'Not Configured',
        status: data?.error || 'Unavailable',
      };
    } catch (err: any) {
      return {
        connected: false,
        configured: false,
        baseUrl: '',
        tokenMasked: 'Not Configured',
        status: err?.message || 'Connection failed',
      };
    }
  }

  /**
   * Publishes an event, webhook, or scheduled message to Upstash QStash.
   * All authentication tokens remain safely server-side.
   */
  async publish(params: QStashPublishParams = {}): Promise<QStashPublishResult> {
    try {
      const res = await apiFetch('/api/qstash', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return {
          success: true,
          message: data.message || 'Message published to QStash',
          messageId: data.messageId,
          url: data.url,
          publishedAt: data.publishedAt || Date.now(),
        };
      }
      return {
        success: false,
        error: data?.error || `QStash error (${res.status})`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error while publishing to QStash',
      };
    }
  }
}

export const qstashService = new QStashService();
