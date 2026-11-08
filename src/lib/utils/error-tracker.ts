'use client';

import { auditService } from '@/lib/services/audit-service';

/**
 * Global Error Tracking & Diagnostics
 * Captures uncaught runtime errors, unhandled promise rejections,
 * and records them safely to the local audit trail for offline survival.
 */

let isInitialized = false;

export function initErrorTracker() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  window.addEventListener('error', (event) => {
    const errorMsg = event.message || 'Unknown window error';
    const source = `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`;

    // Filter out internal Vite HMR / dev websocket artifacts in iFrame preview
    if (
      errorMsg.includes("reading 'send'") ||
      errorMsg.includes('WebSocket') ||
      (event.filename && event.filename.includes('@vite'))
    ) {
      return;
    }

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
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);

    // Filter out internal Vite HMR / dev websocket artifacts in iFrame preview
    if (
      reason.includes("reading 'send'") || 
      reason.includes('WebSocket') || 
      reason.includes('@vite')
    ) {
      return;
    }

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
