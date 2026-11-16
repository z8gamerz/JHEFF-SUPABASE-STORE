'use client';

import { auditService } from '@/lib/services/audit-service';

/**
 * Global Error Tracking & Diagnostics
 * Captures uncaught runtime errors, unhandled promise rejections,
 * sanitizes sensitive auth/token query strings and bearer headers,
 * and records them safely to the local audit trail for offline survival.
 */

let isInitialized = false;

export function sanitizeErrorString(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/([?&]auth=)[^&\s"'`]+/gi, '$1[REDACTED]')
    .replace(/([?&]token=)[^&\s"'`]+/gi, '$1[REDACTED]')
    .replace(/([?&]api[_-]?key=)[^&\s"'`]+/gi, '$1[REDACTED]')
    .replace(/([?&]secret=)[^&\s"'`]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]');
}

export function initErrorTracker() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  window.addEventListener('error', (event) => {
    const rawMsg = event.message || 'Unknown window error';
    const rawSource = `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`;

    // Filter out internal Vite HMR / dev websocket artifacts in iFrame preview
    if (
      rawMsg.includes("reading 'send'") ||
      rawMsg.includes('WebSocket') ||
      (event.filename && event.filename.includes('@vite'))
    ) {
      return;
    }

    const errorMsg = sanitizeErrorString(rawMsg);
    const source = sanitizeErrorString(rawSource);

    console.error('[ErrorTracker] Uncaught error:', errorMsg, source);

    try {
      auditService.log(
        'RUNTIME_ERROR',
        `Uncaught error: ${errorMsg} at ${source}`,
        'system'
      );
    } catch {}
  });

  window.addEventListener('unhandledrejection', (event) => {
    const rawReason = event.reason instanceof Error ? event.reason.message : String(event.reason);

    // Filter out internal Vite HMR / dev websocket artifacts in iFrame preview
    if (
      rawReason.includes("reading 'send'") ||
      rawReason.includes('WebSocket') ||
      rawReason.includes('@vite')
    ) {
      return;
    }

    const reason = sanitizeErrorString(rawReason);

    console.error('[ErrorTracker] Unhandled Promise Rejection:', reason);

    try {
      auditService.log(
        'PROMISE_REJECTION',
        `Unhandled rejection: ${reason}`,
        'system'
      );
    } catch {}
  });
}
