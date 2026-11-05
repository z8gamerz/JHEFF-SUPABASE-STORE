# Weekly Email Report Generator with SMTP Gmail Dispatch

A weekly business report dispatch system for Sari-Sari POS that allows store owners and administrators to email comprehensive sales summaries, itemized sales journals, and customer credit (utang) ledgers for any Monday-to-Sunday cycle, powered by secure Gmail App Password credentials configured directly in Settings.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed during the interactive interview:
> - **Credential Storage**: Managed in an dedicated "Email & Notification Settings" section under the existing Settings page, securely storing Google Account Email, App Password, and default recipient address in encrypted/salted local storage and synced store metadata.
> - **Report Content & Format**: Professional responsive HTML executive summary embedded in the email body, accompanied by formatted CSV attachments for granular data analysis in Excel/Google Sheets.
> - **Weekly Cycle & Dispatch**: Manual "Email Report" modal button in the Reports section with an instant Monday-to-Sunday quick-selector (current week or previous completed week), with optional checkboxes to toggle which reports are bundled.

---

### 1. Overview & Core Concept

- **What It Does**: Adds an **"Email Report"** modal action in the Reports section (`/reports`). Users can choose which reports to bundle—**Daily Summary**, **Sales Journal**, and/or **Credit & Utang Ledger**—over a standard **Monday to Sunday** weekly timeframe (or custom date range), specify recipients, and dispatch the report via Gmail SMTP.
- **Target Audience**: Store owners, branch supervisors, and accountants who need weekly financial reconciliation delivered directly to their inbox without manual CSV copying.
- **Key Value**: Eliminates manual weekly bookkeeping steps by automatically computing revenue, VAT, margins, top products, payment methods, and outstanding customer debt balances, delivering them in a single branded email.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Credentials Setup (Settings)**:
   - Admin navigates to `/settings` $\rightarrow$ **Email & Reports** tab.
   - Enters **Sender Gmail Address** (e.g., `store.owner@gmail.com`), **Google 16-character App Password**, and **Default Recipient Email**.
   - Clicks **"Test Connection"** to verify SMTP connectivity with immediate visual status indicator.
2. **Weekly Report Generation & Dispatch (Reports Page)**:
   - User navigates to `/reports`.
   - Next to the existing "Export CSV" and branch selectors, user clicks the new **"Email Weekly Report"** button (styled with `Mail` icon and subtle glow).
   - The **Email Report Modal** opens with:
     - **Date Range Selector**: Pre-selected to **"This Week (Monday – Sunday)"** or **"Last Week (Monday – Sunday)"** with exact date badges (e.g. `Nov 3, 2026 – Nov 9, 2026`).
     - **Report Selection Checkboxes**:
       - ☑ **Daily & Weekly Sales Summary** (Revenue, transactions, payment methods, net profit).
       - ☑ **Sales Journal** (Itemized transaction audit trail with OR numbers and timestamps).
       - ☑ **Credit & Receivables (Utang) Ledger** (Debtors with active balances, recent payments collected, aging).
     - **Recipient Field**: Auto-filled from settings, editable for one-off recipients.
     - **Branch Filter**: Respects current branch or "All Branches" aggregation.
   - User clicks **"Send Weekly Report"**:
     - Visual progress spinner displays generation and SMTP delivery.
     - Confirmation toast appears upon successful delivery with timestamp logged to the Audit Trail.

#### Visual Theme & Layout Harmony
- **Palette**: Deep slate canvas (`#0F172A` in dark mode, `#FFFFFF` / `#F8FAFC` in light mode), high-contrast emerald/orange accents matching the existing Sari-Sari POS design language.
- **Typography**: Clean tabular numerals (`tabular-nums` / `font-mono`) for all monetary values, percentages, and ticket numbers.
- **Responsive Modal**: Fully touch-friendly and keyboard accessible (`Esc` to dismiss, autofocus on send button).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side SMTP via Express API Route vs. Client-Side Mailto**
  - *Chosen Approach*: Lightweight server proxy route (`/api/send-report-email`) using `nodemailer` connected to `smtp.gmail.com:465`.
  - *Why*: Allows true automated background dispatch with real CSV file attachments and styled HTML email tables. A `mailto:` link cannot attach generated CSV files or render rich HTML templates.
  - *Alternative Considered*: Client-side third-party services (e.g. EmailJS); rejected to protect privacy and avoid external vendor account dependencies.

- **Decision 2: Report Bundling & Modular Attachment Generation**
  - *Chosen Approach*: On demand, the frontend compiles PapaParse CSV strings and an HTML email template for the selected sections, sending the bundle to the API route.
  - *Why*: Gives complete flexibility—user can send only Sales, only Utang, or all three reports together in a single consolidated weekly digest.

- **Decision 3: Gmail App Password Security**
  - *Chosen Approach*: Stored in browser encrypted/protected storage (`metadataService` and IndexedDB `METADATA` store) and passed to the local backend proxy per request. The UI masks the App Password with a toggleable visibility eye icon.
  - *Why*: Keeps the user in total control of their credentials without hardcoding secrets in source control.

---

### 4. Technical Architecture & Data Strategy

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           Client (Browser PWA)                            │
├───────────────────────────────┬───────────────────────────────────────────┤
│    /settings (Admin UI)       │          /reports (Reports Page)          │
│  - Sender Gmail               │  - [Email Weekly Report] button           │
│  - 16-char App Password       │  - Weekly Modal: Mon–Sun selector         │
│  - Default Recipient          │  - Report toggles: Summary | Journal | Debt│
│  - [Test SMTP Connection]     │  - Client-side CSV & HTML Generator       │
└───────────────┬───────────────┴─────────────────────┬─────────────────────┘
                │                                     │
                │ Save Credentials                    │ POST /api/send-report-email
                ▼                                     ▼
┌───────────────────────────────┐     ┌─────────────────────────────────────┐
│  IndexedDB & Metadata Store   │     │    Backend Server Proxy / API       │
│  - STORES.METADATA            │     │  - Express / Vite Middleware Proxy  │
│  - Realtime Cloud Sync        │     │  - Nodemailer (smtp.gmail.com:465)  │
└───────────────────────────────┘     └──────────────────┬──────────────────┘
                                                         │
                                                         ▼
                                       ┌───────────────────────────────────┐
                                       │       Recipient Inbox (Gmail)     │
                                       │  - HTML Executive Digest          │
                                       │  - attached: sales-summary.csv    │
                                       │  - attached: sales-journal.csv    │
                                       │  - attached: credit-utang.csv     │
                                       └───────────────────────────────────┘
```

#### Component & Service Specifications
1. **Backend Email Dispatch Service (`/api/send-report-email`)**:
   - Accepts: `senderEmail`, `appPassword`, `recipientEmail`, `subject`, `htmlBody`, and optional `attachments` array (`filename`, `content`, `contentType`).
   - Uses `nodemailer` with standard Gmail SMTP configuration (`service: 'gmail'`).
   - Validates input and returns clean `{ success: true }` or human-readable SMTP error (e.g. "Invalid App Password").
2. **Weekly Date Utility (`src/lib/utils/weekly-date.ts`)**:
   - Calculates the Monday–Sunday boundaries for the current week or previous week with `date-fns` (`startOfWeek(date, { weekStartsOn: 1 })` and `endOfWeek(date, { weekStartsOn: 1 })`).
3. **Email Report Modal Component (`src/components/reports/email-report-modal.tsx`)**:
   - Clean, accessible modal dialog with checkboxes for Daily Summary, Sales Journal, and Credit/Utang.
   - Week picker (Previous Mon–Sun, Current Mon–Sun, Custom).
   - Recipient email address input with validation.
   - Dispatch and test connection handlers with progress states.
4. **Settings Page Integration (`src/pages/settings/page.tsx`)**:
   - New sub-tab or card under Settings: **"Email & Weekly Report Setup"**.
   - Input fields for Gmail User, Google App Password, and Default Recipient.
5. **Audit Logging**:
   - Automatically logs `REPORT_EMAIL_SENT` with timestamp, recipient email, and selected report types to the existing immutable audit trail.
