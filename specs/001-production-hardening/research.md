# Research & Architectural Decisions: Production Readiness & Maintainability Hardening

**Feature**: `001-production-hardening` | **Date**: 2026-11-16

## 1. Fail-Closed Secrets & Environment Configuration

- **Decision**: Remove all hardcoded fallback tokens, signing keys, and project-specific cloud service URLs/tokens from `api/qstash.ts`, `api/utang-webhook.ts`, `src/lib/services/redis-service.ts`, `src/lib/services/qstash-service.ts`, `src/lib/db/sync-queue.ts`, `src/lib/db/realtime-sync.ts`, `src/pages/login/page.tsx`, `src/components/admin/database-security.tsx`, and `src/components/admin/system-health.tsx`. Require environment variables (or user-supplied runtime Firebase configuration in Settings/localStorage where appropriate) and return explicit `503` / `Not Configured` responses when optional cloud integrations are unconfigured.
- **Rationale**: Currently `api/qstash.ts` ships hardcoded `DEFAULT_TOKEN`, `DEFAULT_CURRENT_SIGNING_KEY`, and `DEFAULT_NEXT_SIGNING_KEY`, while `src/lib/services/redis-service.ts` and `api/utang-webhook.ts` ship a hardcoded Upstash Redis REST URL and token in client and server bundles. Removing embedded credentials satisfies Constitution Principle III and eliminates secret exposure in browser bundles.
- **Alternatives Considered**:
  - *Keep demo credentials behind a `NODE_ENV !== 'production'` check*: Rejected because source-committed credentials remain leaked in repository history and accidental preview deployments.

## 2. Unified Server-Side API Security & Dev/Prod Parity

- **Decision**: Route all `/api/*` endpoints (`/api/send-report-email`, `/api/test-smtp`, `/api/update-firebase-rules`, `/api/utang-webhook`, `/api/qstash`) through a shared request-security pipeline backed by `api/_security.ts` (`applyCors`, `rateLimit`, `clampBodySize`, `requireApiAuth` or explicit QStash signature verification for webhook receivers). Replace inline duplicated SMTP handlers in `vite.config.ts` with direct delegation to the `api/*.ts` handlers, and provide a production Express server entry (`server.ts`) that mounts those exact `api/*.ts` handlers alongside static `dist/` serving when running as a Node container.
- **Rationale**: Currently `vite.config.ts` duplicates `/api/test-smtp` and `/api/send-report-email` inline without `api/_security.ts` protections, while `api/*.ts` handlers themselves use `Access-Control-Allow-Origin: '*'` and skip `requireApiAuth` and `rateLimit`. Unifying on a single handler module per route guarantees identical security enforcement in Vite dev, Node/Docker (`server.ts`), and serverless deployments.
- **Alternatives Considered**:
  - *Keep separate dev logic in `vite.config.ts` and Vercel-only `api/` handlers*: Rejected because security fixes must be maintained twice and behavior diverges between dev, Node, and serverless environments.

## 3. Non-Blocking In-App Dialogs & Error Recovery

- **Decision**: Replace all 15+ native browser `alert()` and `confirm()` calls across pages (`pos`, `products`, `admin/audit-trail`, `admin/users`, `expenses`) and components (`checkout-modal`, `user-management`, `database-security`, `credit-history`, `branch-management`, `product-form`, `csv-import`, `receipt-settings`) with `ConfirmModal` (`src/components/ui/modal.tsx`) and a reusable non-blocking toast/inline banner feedback mechanism (e.g., `ToastProvider` / inline form error state). Enhance `Modal` with Escape-key dismissal and `role="dialog"` / `aria-modal="true"` accessibility attributes.
- **Rationale**: Native `alert()` and `confirm()` block the JS event loop, fail inside sandboxed iframes (such as AI Studio preview), and bypass dark/light theming. Leveraging the existing `Modal` / `ConfirmModal` primitives preserves UI consistency with minimal new code.
- **Alternatives Considered**:
  - *Install an external toast/dialog dependency (e.g., Sonner or Radix Dialog)*: Rejected to keep bundle weight minimal and adhere to existing `motion/react` + Tailwind modal architecture.

## 4. Automated Verification Runner (Zero Heavy Build Overhead)

- **Decision**: Use Node.js 22's built-in test runner (`node:test` + `node:assert/strict`) executed via `tsx --test` (`"test": "tsx --test tests/**/*.test.ts"`), matching the project's existing `tsx` dev dependency (`^4.21.0`). Focus initial test suites on deterministic pure-logic and contract modules: financial/VAT math (`src/lib/utils/financial.ts`), credit cross-matching (`src/lib/utils/credit-matcher.ts`), input sanitization & rate limiting (`src/lib/security/input-sanitizer.ts`, `api/_security.ts`), and sync queue/idempotency behavior (`src/lib/db/sync-queue.ts` with an in-memory storage adapter).
- **Rationale**: `tsx` and Node 22 are already installed in the repository, requiring zero new test framework dependencies, running in `< 5 seconds` in CI, and supporting TypeScript path aliases cleanly.
- **Alternatives Considered**:
  - *Add Vitest or Jest*: Viable later if DOM/React Testing Library suites expand, but `tsx --test` avoids peer-dependency churn and satisfies immediate CI verification gates cleanly.

## 5. Modular Financial Math & Sync Resilience Extraction

- **Decision**: Extract duplicated VAT/NON-VAT, currency rounding (`roundCurrency`), decimal stock arithmetic (`roundQuantity`), and profit calculation helpers into a dedicated domain utility (`src/lib/utils/financial.ts`) shared across POS checkout, reports, sales journal, and daily summary. Harden `sync-queue.ts` with bounded exponential backoff, deterministic `MAX_RETRIES`, preserved `updatedAt` conflict timestamps, and clear pending/failed counters surfaced by `OfflineIndicator`.
- **Rationale**: Centralizing currency and fractional-weight calculations eliminates floating-point drift across checkout, receipts, and reports, fulfilling Constitution Principles I, II, and IV.
- **Alternatives Considered**:
  - *Keep inline `Math.round(x * 100) / 100` expressions across pages*: Rejected because rounding discrepancies between checkout and reports lead to centavo mismatches.

## 6. Direct Upstash Redis Client Elimination in Browser Bundle

- **Decision**: Update `src/lib/services/redis-service.ts` so browser code communicates exclusively with `/api/utang-webhook` instead of instantiating `@upstash/redis` directly in the client with fallback credentials.
- **Rationale**: Browser clients should never hold or embed Upstash Redis write tokens; server-side `/api/utang-webhook` owns the Redis credentials and enforces authorization and rate limiting.
- **Alternatives Considered**:
  - *Keep direct client fallback with `VITE_` env vars*: Rejected because `VITE_*` variables are bundled publicly into client JavaScript.
