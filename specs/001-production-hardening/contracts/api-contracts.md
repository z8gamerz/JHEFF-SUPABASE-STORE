# Interface & API Contracts: Production Readiness & Maintainability Hardening

**Feature**: `001-production-hardening` | **Date**: 2026-11-16

All `/api/*` endpoints share a unified middleware pipeline implemented via `api/_security.ts` and invoked identically across Vite dev middleware (`vite.config.ts`), Node production server (`server.ts`), and serverless deployments.

## Common Security & Error Envelope

### Request Guards (Applied to Every `/api/*` Route)
1. **CORS (`applyCors`)**:
   - Reads `ALLOWED_ORIGINS` / `APP_ORIGIN` / `VITE_APP_ORIGIN`.
   - When an allowlist is configured, disallowed `Origin` headers receive `403 Forbidden`: `{ "success": false, "error": "Origin not allowed." }`.
   - Never emits `Access-Control-Allow-Origin: *` for credentialed or protected endpoints.
2. **Payload Size (`clampBodySize`)**:
   - Rejects oversized JSON payloads (`> 1 MB` default, `> 2 MB` for email reports with CSV attachments) with `413 Payload Too Large`.
3. **Rate Limiting (`rateLimit`)**:
   - Enforces per-IP sliding/window limits per route key, returning `429 Too Many Requests` when exceeded.
4. **Authentication (`requireApiAuth` or Signature Verification)**:
   - Sensitive management/dispatch routes require `X-POS-API-Key` or `Authorization: Bearer <POS_API_SECRET>` when `POS_API_SECRET` is configured, or fail closed with `503` / `401` on privileged administrative actions.
   - Error responses never echo raw secrets, tokens, or stack traces.

### Standard Error Response Schema
```json
{
  "success": false,
  "error": "Human-readable error description",
  "code": "OPTIONAL_MACHINE_CODE"
}
```

---

## Endpoint Contracts

### 1. `POST /api/test-smtp`
- **Purpose**: Verify Gmail SMTP credentials without dispatching an email.
- **Guards**: `applyCors`, `rateLimit(10/min)`, `clampBodySize(32KB)`, `requireApiAuth`.
- **Request Body**: `{ "senderEmail"?: string, "appPassword"?: string }` (falls back to server `SMTP_SENDER_EMAIL` / `SMTP_APP_PASSWORD` env vars only).
- **Responses**:
  - `200 OK`: `{ "success": true, "message": "..." }`
  - `400 Bad Request`: Missing or invalid SMTP credentials.
  - `401 Unauthorized` / `503 Service Unavailable`: Missing/invalid API authorization when `POS_API_SECRET` gate triggers.

### 2. `POST /api/send-report-email`
- **Purpose**: Dispatch formatted HTML business reports and optional CSV attachments via SMTP.
- **Guards**: `applyCors`, `rateLimit(10/min)`, `clampBodySize(2MB)`, `requireApiAuth`.
- **Request Body**: `{ "senderEmail"?: string, "appPassword"?: string, "recipientEmail"?: string, "subject"?: string, "htmlBody": string, "attachments"?: Array<{ "filename": string, "content": string, "contentType"?: string }> }`
- **Responses**:
  - `200 OK`: `{ "success": true, "messageId": string }`
  - `400 Bad Request`: Missing required sender/password/recipient fields.
  - `500 Internal Server Error`: Sanitized SMTP transport failure message.

### 3. `GET | POST /api/update-firebase-rules`
- **Purpose**: Probe Firebase RTDB security rules status (`GET`) or apply `SECURE_PRODUCTION_RULES` (`POST`).
- **Guards**: `applyCors`, `rateLimit(10/min)`, `clampBodySize(64KB)`, `requireApiAuth`.
- **Configuration**: Uses `VITE_FIREBASE_RTDB_URL` (or validated `*.firebasedatabase.app` / `*.firebaseio.com` `body.databaseUrl` on `POST`). If neither env URL nor valid `databaseUrl` is configured, returns `{ "success": false, "configured": false, "error": "Firebase RTDB URL is not configured." }` (`503` on POST, `200` with `configured: false` on diagnostic GET).
- **Responses**:
  - `GET 200 OK`: `{ "success": true, "configured": boolean, "scan"?: { ... } }`
  - `POST 200 OK`: `{ "success": true, "message": "...", "appliedAt": number }`
  - `POST 400 Bad Request`: Invalid database URL or missing database secret (`requiresSecret: true`).

### 4. `GET | POST /api/utang-webhook`
- **Purpose**: Read tabulated credit ledger summaries (`GET`) or push/batch-sync/delete credit records (`POST`) in Upstash Redis.
- **Guards**: `applyCors`, `rateLimit(60/min)`, `clampBodySize(1MB)`, `requireApiAuth`.
- **Configuration**: Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (no hardcoded defaults).
  - If unconfigured: `GET ?action=health` returns `200` `{ "success": false, "configured": false, "status": "not_configured", "error": "Upstash Redis is not configured." }`; other actions return `503 Service Unavailable`.
- **Responses**:
  - `GET 200 OK`: `{ "success": true, "summary": { ... }, "entries": [...] }` or health payload.
  - `POST 200 OK`: `{ "success": true, "message": "...", "syncedAt": number }`.

### 5. `GET | POST /api/qstash`
- **Purpose**: Inspect masked QStash configuration status (`GET`) or publish scheduled tasks (`POST`).
- **Guards**: `applyCors`, `rateLimit(30/min)`, `clampBodySize(128KB)`, `requireApiAuth`.
- **Configuration**: Requires `QSTASH_TOKEN` (and `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` for receiver verification). Zero hardcoded fallback tokens or signing keys.
- **Responses**:
  - `GET 200 OK`: `{ "success": true, "configured": boolean, "connected": boolean, "baseUrl": string | null, "tokenMasked": string, "status": "Active & Protected" | "Not Configured" }`
  - `POST 503 Service Unavailable` (if `QSTASH_TOKEN` is missing): `{ "success": false, "configured": false, "error": "QStash is not configured." }`
  - `POST 400 Bad Request` (if `url` is invalid or non-HTTPS): `{ "success": false, "error": "Valid target URL is required." }`
  - `POST 200 OK`: `{ "success": true, "messageId": string, "publishedAt": number }`.
