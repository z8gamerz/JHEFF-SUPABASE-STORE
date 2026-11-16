# Data Model & State Transitions: Production Readiness & Maintainability Hardening

**Feature**: `001-production-hardening` | **Date**: 2026-11-16

This feature hardens existing domain entities, introduces explicit configuration/diagnostic contracts, and standardizes in-app confirmation/notification states while maintaining 100% backward compatibility with existing browser IndexedDB stores (`SariSariPOS_DB`).

## 1. Existing IndexedDB Entities (Backward-Compatible Constraints)

### `Product`
- **Key Constraints**:
  - `branchId` (required non-empty string for branch isolation)
  - `price`, `cost`: finite numbers `>= 0`, normalized to 2 decimal places (`roundCurrency`)
  - `stock`: finite number `>= 0`; when `isWeightBased === true`, rounded to 3 decimal places (`roundQuantity`) to prevent binary floating-point drift (e.g., `1.25 - 0.1 = 1.15`)
  - `updatedAt`: epoch ms timestamp (Last-Write-Wins sync resolution)
  - `isDeleted`: boolean tombstone preserved during offline sync

### `Transaction`
- **Key Constraints**:
  - `ticketNumber`, `orNumber`: sequential non-empty identifiers
  - `total`, `vatableSales`, `vatAmount`, `amountPaid`, `change`: deterministic 2-decimal currency values
  - `items`: `TransactionItem[]` with exact `quantity` (integer for standard, 3-decimal rounded for `isWeightBased`) and `costPrice` snapshot at time of sale
  - `paymentMethod`: `'cash' | 'gcash' | 'bank_transfer' | 'credit' | 'utang' | 'split'`
  - `paymentDetails.splitBreakdown`: sum of portions MUST equal `total` within `₱0.01`

### `Customer` & `CreditEntry`
- **Key Constraints**:
  - `CreditEntry.type`: `'credit' | 'payment'`
  - `CreditEntry.amount`: positive finite number `> 0` (magnitude normalized; sign inferred from `type` during matching)
  - Cross-matching invariants (`computeCreditCrossMatch`):
    - `totalCredits - totalPayments` reconciles deterministically with `summary.totalOutstanding - sum(unallocatedAmount)`
    - Targeted payments apply first to `targetCreditId`, then FIFO by `timestamp` ascending

### `SyncAction` (`STORES.SYNC_QUEUE`)
- **Fields**: `id?: number`, `store: StoreName`, `type: 'CREATE' | 'UPDATE' | 'DELETE'`, `payload: Record<string, unknown>`, `timestamp: number`, `status: 'pending' | 'processing' | 'failed'`, `retryCount: number`, `lastError?: string`, `nextRetryAt?: number` (optional additive metadata; safe for existing IndexedDB records)
- **State Transitions**:
  - `pending` -> `processing` (when online sync worker claims item and `now >= (nextRetryAt ?? 0)`)
  - `processing` -> *deleted from queue* (on HTTP 2xx remote write)
  - `processing` -> `pending` (on transient network/5xx failure when `retryCount < MAX_RETRIES`, incrementing `retryCount` and setting bounded backoff `nextRetryAt`)
  - `processing` -> `failed` (on unrecoverable 4xx error or `retryCount >= MAX_RETRIES`, surfacing `lastError` in sync diagnostics without blocking local POS use)

## 2. Configuration & Diagnostic Contracts

### `ServiceConfigStatus` (Read-Only Diagnostic Summary)
- **Fields**:
  - `service`: `'firebase' | 'redis' | 'qstash' | 'smtp'`
  - `configured`: `boolean`
  - `status`: `'connected' | 'not_configured' | 'unreachable' | 'unauthorized'`
  - `endpointLabel?`: masked hostname only when configured (never hardcoded default hostnames when unconfigured)
  - `latencyMs?`: `number`
  - `checkedAt`: `number`
- **Validation**: Never includes raw tokens, passwords, signing keys, or database secrets.

### `DiagnosticEvent` (`error-tracker.ts`)
- **Fields**:
  - `id`: `string`
  - `source`: `'error_boundary' | 'unhandled_rejection' | 'window_error' | 'sync_queue' | 'api'`
  - `message`: sanitized string (stripped of query tokens like `?auth=...` and bearer headers)
  - `route`: `string`
  - `timestamp`: `number`

## 3. UI Feedback & Confirmation State

### `ToastNotification`
- **Fields**:
  - `id`: `string`
  - `variant`: `'success' | 'error' | 'warning' | 'info'`
  - `title`: `string`
  - `message?`: `string`
  - `durationMs`: `number` (default `4000`, `0` for sticky manual dismiss)

### `ConfirmDialogRequest`
- **Fields**:
  - `title`: `string`
  - `message`: `string`
  - `confirmText`: `string`
  - `cancelText`: `string`
  - `variant`: `'primary' | 'danger'`
  - `onConfirm`: `() => void | Promise<void>`
- **Invariant**: Canceling via Escape, backdrop click, or Cancel button leaves domain state completely unmodified.
