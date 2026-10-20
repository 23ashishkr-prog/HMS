# HMS: multi-tenant Patient Management System (India)

A Next.js 16 + Postgres SaaS PMS. Many hospitals share one deployment, and each hospital (tenant) has its own users and isolated data.

Modules: registration (UHID + ABHA), appointments, OPD token queue, consultation EMR (vitals, ICD-10, Rx, orders), lab/radiology worklist, pharmacy inventory and dispensing, billing and payments, IPD beds/admission/discharge, insurance/TPA, audit log, live dashboard, plans/subscriptions, and a platform super-admin console.
See `docs/WORKFLOW_GAP_ANALYSIS.md` for what's built and what's left.

**No demo data.** Every screen reads and writes through `/api/*` against your database. The only seeded rows are subscription plans (master data).

## UI (v2)
Role-based desks (Front desk, Doctor desk, Billing, Pharmacy, Lab, IPD, Dashboard) with global patient search (`/` or Ctrl K), Alt+1..7 navigation, Ctrl+Enter submit, toasts and 3D-style icons. See `docs/UX_BENCHMARK.md`. Screenshots are in `docs/screenshots/`.

## UI v3: "Liquid Glass"
Frosted translucent panels (`backdrop-filter`), soft gradient backgrounds, an SF-style system font stack and micro-animations, with automatic light and dark mode. Icons are an original iOS-style squircle glass set (`components/Icon3D.tsx`), also used for the favicon and PWA icons (`app/icon.svg`, `public/icon-*.png`, `app/manifest.ts`).
Fallbacks: browsers without `backdrop-filter` get opaque panels, `prefers-reduced-motion` turns animations off, and low-end PCs (2 or fewer CPU cores) or the user menu toggle "Glass effects: off" switch to a flat fast mode.

## Patient assistant
A floating button on every screen (Ctrl J). Type or scan a UHID, today's token (`#12`) or a phone number. It's a deterministic rules engine over real workflow data (`lib/services/assistant.ts`) that shows the journey stage (registered → waiting → consultation → lab/radiology → pharmacy → billing → done, or admitted with the bed), the **next step** and **where to go**, and one-click actions allowed by your role and plan. Each role sees only its own sections: reception sees demographics, visit and payment due; doctor/nurse see vitals, diagnoses, meds and pending results; lab sees pending orders; pharmacy sees prescriptions; billing sees balance and unbilled items; admin sees everything. Every lookup is written to the audit log.
- `/slip?patient=<id>`: printable or WhatsApp-shareable next-steps slip.
- `/status`: public patient page. It needs hospital code + UHID or token + the registered phone, and shows only stage, next step and location (no clinical details).
- Optional AI Q&A: set `LLM_API_URL` (OpenAI-compatible), `LLM_API_KEY` and `LLM_MODEL`. Without them the assistant says Q&A is disabled and everything else still works.

## Subscription lifecycle
- **Trial**: `TRIAL_MONTHS` (default 2) from sign-up.
- **On hold**: when the trial ends without an active paid plan (or the payment provider reports halted, cancelled or expired), users can still log in but see only the renew screen. Every API refuses clinical access and data changes (HTTP 402). Subscribing restores everything instantly.
- **Purge**: `HOLD_MONTHS` (default 6) after the hold starts, all clinical, financial, scheduling, inventory and audit data is deleted. Only a minimal **patient register** is kept (UHID + name + phone + address, still linked to the hospital, so it comes back on resubscription). All users except the primary admin are deactivated.
- **Warnings**: in-app banners and notices at 30, 7 and 1 days before the hold and before the purge. Email is sent only if an email provider is configured (`RESEND_API_KEY` / `SMTP_URL`); otherwise notices are in-app only.
- **Job**: Vercel Cron (`vercel.json`) calls `GET /api/cron/lifecycle` daily at 00:30 UTC (06:00 IST). It is idempotent and **fails closed**: it refuses (503) unless `CRON_SECRET` is set, and Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
- **Platform admin** (`/platform`) sees each hospital's lifecycle, can extend the trial or hold by 30 days, and can deactivate or reactivate a hospital.

## Architecture
- `lib/services/*`: business logic. Every query is scoped by `ctx.hospitalId`.
- `lib/api.ts`: the central wrapper. It takes the tenant from the signed session cookie only (never from the request), re-checks that the user is active and reads their current role from the DB, applies the plan module gate (HTTP 402), and maps errors.
- `db/migrations/*.sql`: idempotent migrations, tracked in `schema_migrations` (`npm run db:migrate`).
- Tests (`npm test`) run every migration on a real in-process Postgres (PGlite) and cover the full OPD→lab→pharmacy→billing→IPD→TPA flow, **cross-tenant isolation**, and subscription gating/limits.

## Local setup
1. `npm install`
2. Get a Postgres database: a free Neon branch works, or a local Postgres.
3. `cp .env.example .env.local`, then set `DATABASE_URL` and `SESSION_SECRET` (`openssl rand -hex 32`).
4. `DATABASE_URL=... npm run db:migrate`
5. `npm run dev`, open http://localhost:3000/onboarding and register a hospital. You're signed in as its admin.
   - Or use the CLI: `DATABASE_URL=... HOSPITAL_NAME="City Hospital" HOSPITAL_CODE=CITY ADMIN_EMAIL=you@x.in ADMIN_PASSWORD='...' npm run db:create-admin`
6. Optional platform super-admin: `DATABASE_URL=... PLATFORM_ADMIN_EMAIL=... PLATFORM_ADMIN_PASSWORD='12+chars' npm run db:create-platform-admin`, then go to `/platform`.
7. `npm test` (needs no database) and `npm run build`

First steps as a hospital admin: **Settings → Services** (consultation fee, lab tests, radiology), **Staff** (doctor/nurse/reception/lab/pharmacy/billing logins), and **IPD** (wards/beds). Then: Patients → register → check in → Doctor: OPD → start consultation.

## Deploy on Vercel
The project already exists at https://hms-dun-delta.vercel.app, and pushing to a branch makes a preview.
1. Vercel → Project → Settings → Environment Variables:
   - `DATABASE_URL`: Neon / Vercel Postgres connection string (already set if login works today)
   - `SESSION_SECRET`: long random string (already set if login works today)
   - Migrations run **automatically on production builds** (`VERCEL_ENV=production`) using `DATABASE_URL`. They're idempotent, and `006` deactivates the legacy `@aegishms.test` demo logins without deleting anything. Preview builds migrate only if `RUN_MIGRATIONS=true`.
   - **`CRON_SECRET`** (required for the lifecycle job; it refuses to run without it), `TRIAL_MONTHS=2`, `HOLD_MONTHS=6`
   - Optional: `LLM_API_URL`/`LLM_API_KEY`/`LLM_MODEL`, `RESEND_API_KEY`, `ALLOW_PUBLIC_SIGNUP`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `WHATSAPP_*`
   - Use a **separate database for Preview** if you don't want preview builds to migrate production.
2. Redeploy. Then open `/onboarding` to create a hospital, or keep using your existing admin login (existing hospitals are moved to the Enterprise plan).
3. Razorpay (later): create subscription plans in Razorpay with `notes.hospital_id` and `notes.plan_code`, then point the webhook to `/api/subscription/razorpay/webhook`. Nothing is charged or faked until the keys are set.

## WhatsApp
`/api/whatsapp/send` sends through Meta WhatsApp Cloud API. Get patient consent and use approved templates.

## Pharmacy billing mode, first-login password change (v3.1)
- **Settings → Hospital → Pharmacy charges** (per hospital, default *Add dispensed medicines to the patient's bill*):
  - `patient_bill`: each dispensed line becomes an unbilled charge; Billing's auto-bill adds it to the patient's open visit/IPD invoice (unique source link → never billed twice).
  - `cash_sale`: the pharmacy counter must pick a payment mode; dispensing creates its own paid receipt (`<PREFIX>/PH/<year>/000001`) and nothing is left for Billing.
  Dispensing (stock, lines, receipt) runs in one transaction.
- **Temporary passwords**: staff created by an admin (or reset by an admin) must set their own password on first login. Until then every page shows the "Set your own password" screen and APIs answer 403 `mustChangePassword`. Endpoint: `POST /api/auth/password {currentPassword,newPassword}`.
- IPD admission closes the patient's open OPD token for the day. The legacy `/api/admin/users` staff route was removed (use `/api/staff`, which supports all roles).
