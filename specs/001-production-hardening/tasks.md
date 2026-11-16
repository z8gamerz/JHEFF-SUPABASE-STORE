# Tasks: Production Readiness & Maintainability Hardening

**Input**: Design documents from `/specs/001-production-hardening/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api-contracts.md`, `quickstart.md`

**Tests**: Automated verification tests using Node.js `node:test` + `tsx --test` are included per Functional Requirement `FR-006` and User Story 3 (`spec.md`).

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to its user story (`[US1]`–`[US5]`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish test runner wiring, environment template completeness, and verification structure

- [X] T001 Verify all required environment keys (zero live secrets) in `.env.example` including `ALLOWED_ORIGINS`, `APP_ORIGIN`, `VITE_APP_ORIGIN`, `POS_API_SECRET`, `FIREBASE_DATABASE_SECRET`, `VITE_FIREBASE_RTDB_URL`, `VITE_FIREBASE_AUTH_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `SMTP_SENDER_EMAIL`, `SMTP_APP_PASSWORD`, `DEFAULT_REPORT_RECIPIENT`, and `GEMINI_API_KEY`
- [X] T002 Add `"test": "tsx --test tests/*.test.ts"` script to `package.json` and create `tests/` directory
- [X] T003 [P] Remove client-only `VITE_UPSTASH_REDIS_REST_URL` and `VITE_UPSTASH_REDIS_REST_TOKEN` exposure warnings or document server-only Redis access in `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared security middleware, financial math helpers, and non-blocking modal/toast primitives required across stories

**⚠️ CRITICAL**: Complete this phase before beginning user story implementation.

- [X] T004 Upgrade `api/_security.ts` to export unified `parseJsonBody`, `applyCors` (never wildcard `*` for protected APIs; `403` on disallowed `Origin`), `clampBodySize` (`413` on oversized payload), `rateLimit` (`429` when exceeded), `requireApiAuth` (`503` if `POS_API_SECRET` unset, `401` on invalid `X-POS-API-Key` / `Authorization: Bearer`), and `applyApiGuards(req, res, opts)` helper
- [X] T005 [P] Create shared deterministic currency and quantity math module in `src/lib/utils/financial.ts` exporting `roundCurrency` (2 decimals), `roundQuantity` (3 decimals for weight-based stock), `computeVatBreakdown` (VAT vs NON-VAT), `computeLineProfit`, and `validateSplitBreakdown` (reconciling within `₱0.01`)
- [X] T006 [P] Enhance `Modal` and `ConfirmModal` in `src/components/ui/modal.tsx` with `role="dialog"`, `aria-modal="true"`, Escape-key close handler, async `onConfirm` safety, and optional `isLoading` state
- [X] T007 [P] Create non-blocking `ToastProvider` and `useToast` hook (`success` | `error` | `warning` | `info`, auto-dismiss `durationMs` default `4000`, `0` sticky) in `src/components/ui/toast.tsx` and mount it in `src/App.tsx`

**Checkpoint**: Shared security guards, deterministic math utilities, and non-blocking modal/toast UI primitives are ready.

---

## Phase 3: User Story 1 - Secure & Fail-Closed Configuration Management (Priority: P1) 🎯 MVP

**Goal**: Eliminate all hardcoded tokens/signing keys/project URLs and enforce fail-closed authorization across all `/api/*` endpoints and RBAC boundaries.

**Independent Test**: Run with no `.env` secrets configured and execute `tests/api-security.test.ts`; confirm privileged endpoints fail closed (`401`/`403`/`503`) and zero hardcoded tokens or fallback database secrets exist in `src/` or `api/`.

### Tests for User Story 1

- [X] T008 [P] [US1] Write contract tests for `applyCors`, `clampBodySize`, `rateLimit`, `requireApiAuth`, and fail-closed `api/qstash.ts` / `api/utang-webhook.ts` responses in `tests/api-security.test.ts`
- [X] T009 [P] [US1] Write unit tests for input sanitization and password hashing/verification in `tests/input-sanitizer.test.ts`

### Implementation for User Story 1

- [X] T010 [P] [US1] Remove hardcoded `DEFAULT_TOKEN`, `DEFAULT_CURRENT_SIGNING_KEY`, `DEFAULT_NEXT_SIGNING_KEY`, and `httpstat.us` fallback from `api/qstash.ts`; apply `applyApiGuards` (`rateLimit: 30/min`, `clampBodySize: 128KB`), return `configured: false` on `GET` and `503` on `POST` when unconfigured, and validate HTTPS target URLs
- [X] T011 [P] [US1] Remove hardcoded `proper-gull-192572.upstash.io` URL and token fallbacks from `api/utang-webhook.ts`; apply `applyApiGuards` (`rateLimit: 60/min`, `clampBodySize: 1MB`) and return `not_configured` (`200` on `GET ?action=health`) or `503` on mutations when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are missing
- [X] T012 [P] [US1] Refactor `api/test-smtp.ts` (`rateLimit: 10/min`, `clampBodySize: 32KB`) and `api/send-report-email.ts` (`rateLimit: 10/min`, `clampBodySize: 2MB`) to use `applyApiGuards` and `parseJsonBody` from `api/_security.ts` without echoing credentials
- [X] T013 [P] [US1] Refactor `api/update-firebase-rules.ts` (`rateLimit: 10/min`, `clampBodySize: 64KB`) to remove hardcoded RTDB URL fallback, use `applyApiGuards`, and return explicit unconfigured status when `VITE_FIREBASE_RTDB_URL` and `body.databaseUrl` are both missing
- [X] T014 [US1] Refactor `src/lib/services/redis-service.ts` to remove `@upstash/redis` direct browser fallback and hardcoded Redis URL/token, delegating all calls exclusively to `/api/utang-webhook` with `src/lib/api-client.ts` auth headers
- [X] T015 [P] [US1] Remove hardcoded Firebase RTDB URL fallback from `src/lib/db/sync-queue.ts`, `src/lib/db/realtime-sync.ts`, `src/pages/login/page.tsx`, and `src/components/admin/database-security.tsx`, reading configured URL from `import.meta.env.VITE_FIREBASE_RTDB_URL` or runtime store settings and handling unconfigured mode gracefully
- [X] T016 [US1] Update `src/lib/api-client.ts` so protected `/api/*` requests attach `X-POS-API-Key` when configured in runtime/env without exposing server secrets in `VITE_*` client defaults

**Checkpoint**: User Story 1 is independently testable — zero hardcoded credentials remain and all `/api/*` handlers fail closed.

---

## Phase 4: User Story 2 - Non-Blocking, Consistent Error Recovery & In-App Dialogs (Priority: P1)

**Goal**: Replace every native browser `alert()` and `confirm()` call with themed `ConfirmModal`, `useToast`, or inline validation, and harden offline sync retries with bounded backoff.

**Independent Test**: Trigger checkout validation, user/expense/branch/credit deletions, receipt reset, and simulated offline sync failures; confirm zero browser `alert`/`confirm` popups occur and queued mutations retry cleanly.

### Implementation for User Story 2

- [X] T017 [P] [US2] Replace `alert()` calls in `src/components/pos/checkout-modal.tsx` and `src/pages/pos/page.tsx` with inline validation banners inside the modal and `useToast().error` recovery notifications
- [X] T018 [P] [US2] Replace `alert()` calls in `src/pages/products/page.tsx`, `src/components/inventory/product-form.tsx`, and `src/components/inventory/csv-import.tsx` with inline form error state and `useToast` notifications
- [X] T019 [P] [US2] Replace `alert()` and `confirm()` calls in `src/pages/admin/users/page.tsx`, `src/components/admin/user-management.tsx`, and `src/pages/admin/audit-trail/page.tsx` with `ConfirmModal` and `useToast`
- [X] T020 [P] [US2] Replace `confirm()` and `alert()` calls in `src/pages/expenses/page.tsx`, `src/components/branches/branch-management.tsx`, `src/components/utang/credit-history.tsx`, `src/components/settings/receipt-settings.tsx`, and `src/components/admin/database-security.tsx` with `ConfirmModal` and `useToast`
- [X] T021 [US2] Harden `src/lib/db/sync-queue.ts` to add `nextRetryAt` bounded exponential backoff, `lastError` tracking, deterministic `MAX_RETRIES` transition to `'failed'`, and conflict-safe `updatedAt` / `isDeleted` tombstone preservation without blocking local checkout

**Checkpoint**: User Stories 1 and 2 both work independently — zero blocking browser dialogs remain and offline failures recover cleanly.

---

## Phase 5: User Story 3 - Deterministic Financial & Sync Reliability Verification (Priority: P2)

**Goal**: Verify financial math, weight-based precision, credit cross-matching, and offline sync queue state transitions with automated tests and single-source-of-truth helpers.

**Independent Test**: Run `npm test` and confirm `tests/financial.test.ts`, `tests/credit-matcher.test.ts`, and `tests/sync-queue.test.ts` pass 100% deterministically in under 10 seconds.

### Tests for User Story 3

- [X] T022 [P] [US3] Write unit tests for `roundCurrency`, `roundQuantity`, VAT/NON-VAT extraction, split checkout reconciliation, and weight-based stock deductions in `tests/financial.test.ts`
- [X] T023 [P] [US3] Write unit tests for FIFO matching, targeted `targetCreditId` payments, overpayment `unallocatedAmount`, and soft-deleted entry exclusion in `tests/credit-matcher.test.ts`
- [X] T024 [P] [US3] Write integration tests for `SyncAction` state transitions (`pending` -> `processing` -> deleted / backoff `pending` / `failed` at `MAX_RETRIES`) and tombstone preservation in `tests/sync-queue.test.ts`

### Implementation for User Story 3

- [X] T025 [US3] Refactor `src/pages/pos/page.tsx`, `src/components/pos/checkout-modal.tsx`, `src/pages/reports/sales-journal/page.tsx`, and `src/lib/hooks/use-reports.ts` to use `roundCurrency`, `roundQuantity`, and `computeVatBreakdown` from `src/lib/utils/financial.ts`
- [X] T026 [US3] Normalize currency rounding (`roundCurrency`) in `src/lib/utils/credit-matcher.ts` so `summary.totalCredits`, `summary.totalPayments`, and `summary.totalOutstanding` reconcile without floating-point drift

**Checkpoint**: All financial and sync verification suites pass and share unified math utilities.

---

## Phase 6: User Story 4 - Modular, Maintainable Code Structure & Unified Runtime Parity (Priority: P2)

**Goal**: Unify `/api/*` request execution across Vite dev and production Node serving (`server.ts`) and enforce full static + test + build checks in CI.

**Independent Test**: Run `npm run lint && npm test && npm run build` and verify both `npm run dev` and `npm start` invoke the exact `api/*.ts` handlers with identical security rules.

### Implementation for User Story 4

- [X] T027 [US4] Refactor `vite.config.ts` `smtpApiPlugin` to remove duplicated inline `/api/test-smtp` and `/api/send-report-email` handlers and delegate all `/api/*` routes cleanly to `api/*.ts` via a shared Node request/response adapter
- [X] T028 [P] [US4] Create production Express server entry `server.ts` mounting all `api/*.ts` endpoints before static `dist/` serving and SPA fallback on `0.0.0.0:3000`
- [X] T029 [P] [US4] Update `package.json` to add `"start": "tsx server.ts"` (or built server command) and verify `Dockerfile` / `nginx.conf` compatibility
- [X] T030 [US4] Update `.github/workflows/ci.yml` to run `npm run lint`, `npm test`, and `npm run build` with `dist/index.html` output verification

**Checkpoint**: Dev, production Node, serverless handlers, and CI pipeline share single-source-of-truth execution and automated gates.

---

## Phase 7: User Story 5 - Production Observability & Diagnostic Hygiene (Priority: P3)

**Goal**: Ensure error tracking strips sensitive credentials and system health diagnostics accurately report unconfigured vs. reachable integration states.

**Independent Test**: Inspect `SystemHealthDashboard` and `error-tracker.ts` with integrations unconfigured and simulated error strings containing `?auth=secret`; verify zero secret leakage and accurate `"Not Configured"` states.

### Implementation for User Story 5

- [X] T031 [P] [US5] Update `src/lib/utils/error-tracker.ts` to sanitize `?auth=...`, `Bearer ...`, and token query strings before persisting `RUNTIME_ERROR` / `PROMISE_REJECTION` entries to `auditService`
- [X] T032 [P] [US5] Update `src/lib/services/qstash-service.ts` and `src/components/admin/system-health.tsx` to remove hardcoded `proper-gull-192572.upstash.io` / `qstash-us-east-1.upstash.io` display strings and show explicit `"Not Configured"` status when services are inactive

**Checkpoint**: Diagnostics and health views report accurate live configuration state with sanitized error context.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final security audit, verification gates, and quickstart validation

- [X] T033 [P] Run repository grep audit to verify zero remaining `alert(`, `confirm(`, or hardcoded QStash/Redis token literals across `src/` and `api/`
- [X] T034 Run full release gate sequence (`npm run lint && npm test && npm run build`) and execute `specs/001-production-hardening/quickstart.md` validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately — blocks nothing.
- **Foundational (Phase 2)**: Depends on Phase 1 (`T001`–`T003`) — **BLOCKS** all user stories (`[US1]`–`[US5]`).
- **User Story 1 (Phase 3, P1)**: Depends on Phase 2 (`T004`). Independent of other user stories.
- **User Story 2 (Phase 4, P1)**: Depends on Phase 2 (`T006`, `T007`). Independent of `[US1]`.
- **User Story 3 (Phase 5, P2)**: Depends on Phase 2 (`T005`) and benefits from `T021` for sync tests.
- **User Story 4 (Phase 6, P2)**: Depends on Phase 3 (`T010`–`T013`) so `api/*.ts` handlers are hardened before `vite.config.ts` and `server.ts` mount them.
- **User Story 5 (Phase 7, P3)**: Depends on Phase 3 (`T010`, `T011`) for unconfigured API status payloads.
- **Polish (Phase 8)**: Depends on completion of Phases 3–7.

### Parallel Opportunities

- Within **Phase 2**: `T005`, `T006`, and `T007` touch separate files and run in parallel alongside `T004`.
- Within **Phase 3 (US1)**: `T008`, `T009`, `T010`, `T011`, `T012`, `T013`, and `T015` can execute in parallel on separate files before wiring `T014` and `T016`.
- Within **Phase 4 (US2)**: `T017`, `T018`, `T019`, and `T020` touch completely disjoint UI components/pages and run in parallel.
- Within **Phase 5 (US3)**: `T022`, `T023`, and `T024` test suites can be authored in parallel before `T025` and `T026`.

---

## Parallel Example: User Story 1 & User Story 2

```bash
# US1 parallel backend hardening:
T010: Harden api/qstash.ts
T011: Harden api/utang-webhook.ts
T012: Harden api/test-smtp.ts & api/send-report-email.ts
T013: Harden api/update-firebase-rules.ts

# US2 parallel dialog replacement:
T017: POS checkout modal & page
T018: Products page, product form & CSV import
T019: Admin users & audit trail
T020: Expenses, branches, credit history, receipt settings & database security
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 — P1)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1: Fail-Closed Security & Zero Hardcoded Secrets) and verify `tests/api-security.test.ts` + `tests/input-sanitizer.test.ts`.
3. Complete Phase 4 (US2: Replace all `alert`/`confirm` dialogs + harden offline sync retries).
4. Validate P1 stories before moving to P2.

### Incremental Delivery

1. Phase 5 (US3): Deterministic financial & sync tests + unified rounding helpers.
2. Phase 6 (US4): Unified `vite.config.ts` / `server.ts` parity + CI workflow gate (`npm test`).
3. Phase 7 (US5): Diagnostic & system health hygiene.
4. Phase 8: Final audit + full `npm run lint && npm test && npm run build` verification.

---

## Phase 9: Convergence

- [X] T035 Align `Dockerfile`, `nginx.conf`, and runtime `package.json` `tsx` dependency so containerized builds serve both `dist/` and all `/api/*` endpoints via `server.ts` on port `3000` per Constitution Production Architecture & T029 (`partial`)
- [X] T036 Document `VITE_POS_API_KEY`, `FIREBASE_RTDB_URL`, `QSTASH_BASE_URL`, `PORT`, and `HOST` with empty placeholders in `.env.example` per FR-002 & Constitution Environment Hygiene (`partial`)
- [X] T037 Sanitize caught error messages and stacks via `sanitizeErrorString` in `src/components/ui/error-boundary.tsx` before logging to `auditService`, rendering fallback UI, or downloading crash reports per Constitution V & US5/AC1 (`partial`)
- [X] T038 Replace inline `Math.round(... * 100) / 100` currency rounding in `src/lib/services/customer-service.ts` with shared `roundCurrency` from `src/lib/utils/financial.ts` per FR-007 & Constitution II/IV (`partial`)

