<!--
Sync Impact Report:
- Version change: 1.0.0 -> 1.1.0 (MINOR: expanded principles and added strict production-readiness, maintainability, and quality-gate rules)
- Modified principles:
  - I. Offline-First & Local Persistence -> I. Offline-First & Resilient Local Persistence (NON-NEGOTIABLE)
  - II. Financial, Tax & Ledger Accuracy -> II. Financial, Tax & Ledger Integrity
  - III. Multi-Branch Isolation & Role-Based Access Control (RBAC) + IV. Security & Secret Hygiene -> consolidated and expanded into III. Fail-Closed Security, Multi-Branch Isolation & RBAC
  - V. Responsive PWA & High-Contrast Accessibility -> expanded into V. Production Observability, Error Recovery & Accessibility
- Added principles/sections:
  - IV. Modular Architecture & Maintainability (NON-NEGOTIABLE)
  - Production Architecture & Operational Constraints (replaces Technical Stack & Constraints)
  - Development Workflow, Testing & Quality Gates (replaces Development Workflow & Quality Gates)
- Removed sections: None (previous IV merged into III; Technical Stack and Development Workflow upgraded)
- Follow-up TODOs: None
-->

# Sari-Sari POS Constitution

## Core Principles

### I. Offline-First & Resilient Local Persistence (NON-NEGOTIABLE)

Every core POS workflow—checkout, inventory management, customer credit (`utang`) ledger, expenses, restocking, and reporting—MUST operate deterministically offline using browser IndexedDB (`src/lib/db/idb.ts`) and enqueue mutations through `src/lib/db/sync-queue.ts`. Cloud synchronization (Firebase Realtime Database and Upstash Redis) MUST treat network and remote services as eventually consistent: mutations MUST be idempotent, retry with bounded backoff, preserve `updatedAt` timestamps and soft-delete (`isDeleted`) tombstones, and never block or discard a cashier transaction due to connectivity failures.

### II. Financial, Tax & Ledger Integrity

Monetary calculations, VAT/NON-VAT tax breakdowns, sequential Official Receipt (`orNumber`) and ticket (`ticketNumber`) numbering, cost-at-sale profit tracking, and credit-to-payment cross-matching (`credit-matcher.ts`) MUST be deterministic, auditable, and rounded consistently to two decimal places for currency totals. Weight-based products (`isWeightBased`, fractional `quantity` and `stock`) MUST preserve decimal precision without floating-point drift. Financial transaction logs and audit trails MUST remain append-only and traceable across branches.

### III. Fail-Closed Security, Multi-Branch Isolation & RBAC

All operational records (`Product`, `Transaction`, `Customer`, `CreditEntry`, `Expense`, `EWalletTransaction`, `RestockTransaction`) MUST be scoped by `branchId` and guarded by role-based access control (`admin` vs. `cashier`) across both UI routes (`AuthGuard`, `isBranchAuthorized`) and backend/database rules. Production builds MUST fail closed rather than falling back to hardcoded credentials, default API keys, or wildcard CORS origins: all secrets (SMTP App Passwords, Firebase Database Secrets, Upstash tokens, QStash signing keys, `POS_API_SECRET`) MUST reside exclusively in environment configuration or user-supplied runtime config, never hardcoded in `src/` or `api/`. All external inputs MUST be sanitized (`input-sanitizer.ts`) and rate-limited.

### IV. Modular Architecture & Maintainability (NON-NEGOTIABLE)

Code MUST maintain strict separation of concerns across four layers: (1) declarative UI components (`src/components/*`, `src/pages/*`), (2) stateful React hooks/contexts (`src/lib/hooks/*`, `src/lib/contexts/*`), (3) domain services (`src/lib/services/*` extending `base-service.ts`), and (4) persistence/API adapters (`src/lib/db/*`, `api/*`). Pages MUST compose hooks and reusable components rather than embedding raw fetch calls, direct IndexedDB queries, or duplicated business formulas. Domain models and API payloads MUST use explicit TypeScript interfaces, avoiding untyped `any` across service boundaries and eliminating dead code or duplicate utility implementations.

### V. Production Observability, Error Recovery & Accessibility

Runtime failures MUST be captured through React `ErrorBoundary` components and structured error tracking (`error-tracker.ts`) without exposing sensitive tokens or stack traces in user-facing UI. Failures MUST surface clear, actionable recovery states instead of silent `catch` blocks or blocking browser primitives (`window.alert`, `window.confirm`, `window.open`). The responsive PWA (`vite-plugin-pwa`) MUST preserve high-contrast readability across light and dark themes, support 58mm/80mm thermal receipt printing, and remain usable on mobile, tablet, and desktop viewports.

## Production Architecture & Operational Constraints

- **Core Stack**: React 19, TypeScript (`~5.8`), Vite 6, Tailwind CSS v4, `lucide-react`, `motion/react`, `recharts`, `papaparse`, `jspdf`, `vite-plugin-pwa`.
- **Persistence & Sync**: Browser IndexedDB as primary source of truth (`src/lib/db/idb.ts`), paired with `sync-queue.ts` and `realtime-sync.ts` for Firebase RTDB and Upstash Redis synchronization. Any IndexedDB schema change MUST preserve backward compatibility for existing stores and upgrade paths.
- **Server-Side API Endpoints**: Privileged handlers (`/api/send-report-email`, `/api/test-smtp`, `/api/update-firebase-rules`, `/api/utang-webhook`, `/api/qstash`) MUST enforce `api/_security.ts` controls (origin checks, request size clamping, rate limiting, and API auth) in both production serverless/Node runtimes and the Vite dev middleware (`vite.config.ts`).
- **Environment Hygiene**: Every environment variable referenced in `src/` or `api/` MUST be documented in `.env.example` with empty placeholder values. Production containers (`Dockerfile`, `nginx.conf`, `vercel.json`) MUST serve built static assets cleanly alongside API endpoints without dev-only shortcuts.

## Development Workflow, Testing & Quality Gates

1. **Spec-Driven Delivery**: Non-trivial features, refactors, and architectural changes MUST follow the Spec Kit pipeline: `constitution.md` -> `specs/<feature>/spec.md` -> `plan.md` -> `tasks.md` -> implementation and verification.
2. **Mandatory Static & Build Gates**: Every change MUST pass `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`) with `dist/index.html` verified, matching `.github/workflows/ci.yml`.
3. **Critical-Path Verification**: Financial math (VAT, profit, split checkout, credit cross-matching), offline sync queueing, and `/api/*` security middleware MUST have reproducible verification (automated unit/integration tests or scripted checks) before production release.
4. **Incremental Refactoring Discipline**: Technical debt and maintainability improvements MUST preserve existing user data, offline functionality, and BIR/receipt compatibility while keeping commits focused and reviewable.

## Governance

This constitution supersedes ad-hoc conventions and governs all specifications, technical plans, code reviews, and releases for Sari-Sari POS. Any complexity that deviates from modular boundaries or introduces new runtime dependencies MUST be justified in the feature's `plan.md`. Amendments require updating `.specify/memory/constitution.md`, documenting the change in a Sync Impact Report, and bumping the semantic version (`MAJOR` for incompatible principle removals/redefinitions, `MINOR` for new or materially expanded principles/sections, `PATCH` for clarifications or wording fixes).

**Version**: 1.1.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
