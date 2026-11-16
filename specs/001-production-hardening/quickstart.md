# Quickstart Validation Guide: Production Readiness & Maintainability Hardening

**Feature**: `001-production-hardening` | **Date**: 2026-11-16

Use this guide to validate that Sari-Sari POS meets all production-readiness and maintainability requirements end-to-end.

## Prerequisites

- Node.js `>= 20` (Node 22 recommended) and `npm`
- Clean workspace with dependencies installed: `npm install`

## 1. Static Checks, Automated Verification & Production Build

Run the three mandatory release gates from the repository root:

```bash
npm run lint
npm test
npm run build
```

**Expected outcomes**:
- `npm run lint` (`tsc --noEmit`) exits `0` with zero TypeScript errors.
- `npm test` runs the automated verification suite covering financial/VAT math, decimal weight quantities, credit cross-matching (`specs/001-production-hardening/data-model.md`), input sanitization, and offline sync queue state transitions, exiting `0` in under 30 seconds.
- `npm run build` produces `dist/index.html` cleanly with zero missing asset warnings.

## 2. Secret Hygiene & Fail-Closed Backend Verification

1. Start the server without any `.env` credentials set:
   ```bash
   npm run dev
   ```
2. Probe the backend contracts documented in `specs/001-production-hardening/contracts/api-contracts.md`:
   - `GET /api/qstash` reports `"configured": false` and `"status": "Not Configured"` (no masked fallback token).
   - `GET /api/utang-webhook?action=health` reports `"status": "not_configured"` (no hardcoded hostname).
   - `POST /api/send-report-email` and `POST /api/qstash` fail closed (`401`/`503`) rather than executing with embedded credentials.
3. Inspect built client assets (`dist/assets/*.js`) to confirm zero third-party Redis tokens, QStash tokens, or signing keys are present.

## 3. Non-Blocking UI & Offline Checkout Walkthrough

1. Open the app in a browser (including mobile viewport).
2. Navigate to **POS Checkout** (`#/pos` or `/pos`), attempt checkout on a credit sale without selecting a customer, or test split payment mismatch: verify inline validation displays inside the checkout modal with zero browser `alert()` popups.
3. Navigate to **Expenses**, **Users**, **Branches**, **Credit Ledger**, and **Settings -> Receipt** and trigger delete/reset actions: verify every confirmation uses the themed in-app `ConfirmModal` and cancels cleanly on Escape or backdrop click.
4. Toggle browser offline mode, complete a cash and weight-based checkout, verify the receipt renders and offline pending indicator updates, then restore connectivity and verify the queued mutation syncs cleanly.

## 4. Production Container / Node Server Parity Check

1. Build and start the production server (`npm run build && npm start`).
2. Confirm the app serves on port `3000` and `/api/*` endpoints enforce identical origin, rate-limit, payload-size, and auth behavior as `npm run dev`.
