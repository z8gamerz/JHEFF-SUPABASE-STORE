# Implementation Plan: Production Readiness & Maintainability Hardening

**Branch**: `001-production-hardening` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-production-hardening/spec.md`

## Summary

Harden Sari-Sari POS for production deployment and long-term maintainability in alignment with the v1.1.0 Constitution: eliminate all hardcoded service tokens/URLs across `api/` and `src/` with fail-closed server-side guards; unify `/api/*` security middleware across Vite dev, serverless, and a production Node/Express entry (`server.ts`); replace all blocking browser `alert()`/`confirm()` calls with accessible themed `ConfirmModal` and toast/inline validation components; centralize financial/VAT/decimal-weight rounding and harden offline IndexedDB sync retries; and establish an automated `tsx --test` verification suite wired into `package.json` and `.github/workflows/ci.yml`.

## Technical Context

**Language/Version**: TypeScript `~5.8.2`, Node.js `22` (ESM), React `19.0.1`
**Primary Dependencies**: Vite `6.2.3`, Tailwind CSS `^4.1.14`, Express `^4.21.2`, `lucide-react`, `motion/react`, `recharts`, `nodemailer`, `@upstash/redis`, `@upstash/qstash`, `vite-plugin-pwa`, `tsx`
**Storage**: Browser IndexedDB (`SariSariPOS_DB` via `src/lib/db/idb.ts`) as offline-first primary store; optional Firebase RTDB & Upstash Redis cloud sync
**Testing**: Node.js `node:test` + `node:assert/strict` executed via `tsx --test` (`npm test`)
**Target Platform**: Web PWA (mobile, tablet, desktop) + Node.js 22 / Vercel serverless `/api/*` endpoints on port `3000`
**Project Type**: Full-stack React SPA (Vite) + Express/Serverless API handlers
**Performance Goals**: Instant (`< 50ms`) offline POS checkout & cart updates; `< 30s` total `npm run lint && npm test && npm run build` CI execution
**Constraints**: Port `3000` (`0.0.0.0`); zero `window.alert`/`confirm`/`open`; zero hardcoded credentials in client or server code; 100% backward compatibility with existing IndexedDB merchant data
**Scale/Scope**: 18 pages, ~35 UI components, 16 domain services, 5 `/api/*` endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Offline-First & Resilient Local Persistence (NON-NEGOTIABLE)**: PASS — Preserves IndexedDB primary storage, adds bounded retry backoff and idempotent tombstone handling in `sync-queue.ts`, and never blocks local POS sales on remote failures.
- **II. Financial, Tax & Ledger Integrity**: PASS — Consolidates currency (`2` decimals) and weight (`3` decimals) rounding into `src/lib/utils/financial.ts` and verifies VAT/NON-VAT, split checkout, and `credit-matcher.ts` via automated tests.
- **III. Fail-Closed Security, Multi-Branch Isolation & RBAC**: PASS — Removes all hardcoded QStash/Redis/Firebase secrets and host fallbacks, restricts Redis client usage to server-side `/api/utang-webhook`, and applies `api/_security.ts` uniformly across dev and prod runtimes.
- **IV. Modular Architecture & Maintainability (NON-NEGOTIABLE)**: PASS — Eliminates duplicated SMTP handlers in `vite.config.ts`, introduces unified `server.ts` + shared handler adapter, and centralizes financial/dialog helpers.
- **V. Production Observability, Error Recovery & Accessibility**: PASS — Replaces all `alert`/`confirm` popups with accessible `ConfirmModal` and non-blocking `ToastProvider` / inline errors, and sanitizes diagnostic events and `SystemHealthDashboard`.

*Post-Design Re-Check (after Phase 1 artifacts)*: All 5 gates remain PASS with zero complexity violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-production-hardening/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/
│   └── api-contracts.md # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
api/
├── _security.ts               # Unified CORS, auth, rate-limit, payload-clamp, and body parser helpers
├── qstash.ts                  # Fail-closed QStash status & publish handler (no hardcoded tokens)
├── send-report-email.ts       # Protected SMTP report dispatch handler
├── test-smtp.ts               # Protected SMTP credential verification handler
├── update-firebase-rules.ts   # Protected RTDB rules scan & update handler
└── utang-webhook.ts           # Protected Upstash Redis ledger webhook (no hardcoded tokens)

src/
├── App.tsx                    # App shell wrapped with ToastProvider & ErrorBoundary
├── components/
│   ├── ui/
│   │   ├── modal.tsx          # Accessible Modal & ConfirmModal (Escape key, ARIA roles)
│   │   └── toast.tsx          # Non-blocking toast notification provider & hook
│   ├── admin/
│   │   ├── database-security.tsx
│   │   ├── system-health.tsx  # Accurate unconfigured/reachable status without hardcoded hosts
│   │   └── user-management.tsx
│   ├── branches/branch-management.tsx
│   ├── inventory/{csv-import.tsx, product-form.tsx}
│   ├── pos/checkout-modal.tsx
│   ├── settings/receipt-settings.tsx
│   └── utang/credit-history.tsx
├── lib/
│   ├── db/{idb.ts, realtime-sync.ts, sync-queue.ts}
│   ├── security/{auth-crypto.ts, input-sanitizer.ts, permissions.ts, rate-limiter.ts}
│   ├── services/{qstash-service.ts, redis-service.ts}
│   └── utils/{credit-matcher.ts, error-tracker.ts, financial.ts}
└── pages/
    ├── admin/{audit-trail/page.tsx, users/page.tsx}
    ├── expenses/page.tsx
    ├── login/page.tsx
    ├── pos/page.tsx
    └── products/page.tsx

tests/
├── api-security.test.ts       # Tests for _security.ts guards & fail-closed API handlers
├── credit-matcher.test.ts     # Tests for FIFO, targeted payments, and rounding reconciliation
├── financial.test.ts          # Tests for VAT/NON-VAT, split checkout, profit & weight arithmetic
├── input-sanitizer.test.ts    # Tests for sanitization & auth-crypto helpers
└── sync-queue.test.ts         # Tests for idempotency, backoff retries, and tombstones

server.ts                      # Production Express server serving dist/ + /api/* routes on port 3000
vite.config.ts                 # Dev server middleware delegating directly to api/*.ts handlers
package.json                   # Adds "test" and "start": "node server.ts" / "tsx server.ts"
.env.example                   # Complete, secret-free documentation of all env vars
.github/workflows/ci.yml       # Runs npm ci, npm run lint, npm test, npm run build
```

**Structure Decision**: Retain the existing single-repository Vite + React SPA (`src/`) with colocated `/api/*` handlers (`api/`) and add a minimal `server.ts` production Express entry point plus a `tests/` suite at the repository root. This keeps existing imports (`@/*`) and Vercel/Docker compatibility intact while delivering true dev/prod runtime parity.

## Complexity Tracking

No Constitution Check violations requiring justification.
