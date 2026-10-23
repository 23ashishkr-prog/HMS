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


## Plans (India list, ex-GST)

| Plan | Monthly | Annual | Includes |
|------|---------|--------|----------|
| **Clinic** | ₹1,999 | ₹19,990 | Online + token booking, front desk queue, doctor consult for booked visits, basic patient register |
| **Basic** | ₹19,999 | ₹1,99,990 | Full hospital ops (registration, OPD, billing, lab, pharmacy, IPD, Excel import, patient portal). **30-day free trial defaults here.** |
| **AI + Customer Engagement** | ₹49,999 | ₹4,99,990 | Basic + AI doctor assistant + WhatsApp/e-mail engagement + video Meet |

Single source of truth: `lib/plans.ts`. DB seed: migration `033_three_plans.sql`.

## Subscription lifecycle
- **Trial**: `TRIAL_DAYS` (default 30) from sign-up. Free signup is always on the **Basic** plan (never Clinic, never AI/engagement). After trial → hold → purge after `HOLD_MONTHS` (default 6), keeping name/phone/address.
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
   - **`CRON_SECRET`** (required for the lifecycle job; it refuses to run without it), `TRIAL_DAYS=30`, `HOLD_MONTHS=6`
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

## Data-quality auto-correction, incident reporting, patient notifications (v3.2)
**Auto-correction** (`lib/services/normalize.ts`, applied on every patient/vitals/diagnosis/prescription write, API and UI alike):
- Safe fixes are applied silently and reported back as `corrections` (UI toast "We corrected: …"):
  - names are trimmed and title-cased;
  - mobile numbers become +91 E.164;
  - PIN codes are de-spaced and fill in the state (offline India Post circle table);
  - DD/MM/YYYY dates become ISO;
  - ICD-10 codes are formatted (`j029` → `J02.9`) and the description is filled from a common-code table;
  - dose frequency is standardised (`BD` → `1-0-1`), and so is duration (`2 wks` → `14 days`);
  - temperatures entered in °F are converted to °C.
- Unsafe cases come back as `suggestions` ("Please check: …"):
  - unusual vitals;
  - a PIN/state mismatch;
  - an e-mail domain typo;
  - an unknown frequency;
  - an ICD-10 suggestion from the diagnosis text.
- Impossible values are refused (e.g. SpO2 above 100, diastolic ≥ systolic, a DOB in the future).
- **Duplicate patients:** the same phone plus the same first name (and DOB if known) returns 409 with the matching UHID. Pass `confirmNotDuplicate` to register anyway.
- Every correction is written to the audit log (`autocorrect`).
- **Retries:** single statements are retried on transient DB errors (serialisation, connection reset, admin shutdown).
- **Idempotency:** create and payment endpoints accept `Idempotency-Key`. The browser client derives it from method + URL + body within a 20-second window, so a double submit returns the first response instead of creating twice.

**Incidents** (`lib/services/incidents.ts`):
- **What is captured:** server 500s (with a request id), the React error boundaries and browser `error`/`unhandledrejection`.
- **Privacy:** messages are scrubbed of phone numbers, e-mails, UHIDs, ids and tokens. No PHI or passwords are stored.
- **De-duplication:** incidents are grouped by fingerprint, and a notification goes out once per incident (again after 24 h if it is still open), capped at `INCIDENT_NOTIFY_PER_HOUR` (default 10).
- **Where notifications go:** a GitHub issue (`GITHUB_ISSUES_TOKEN`, fine-grained with issues:write; `GITHUB_ISSUES_REPO`, default `23ashishkr-prog/HMS`) and/or an e-mail to `TECH_ALERT_EMAIL` via Resend.
- **Unconfigured:** incidents are still recorded and the notify step is skipped quietly; the reason is shown on /platform.
- **Where to see them:** /platform → Incidents lists every incident with its status.

**Patient notifications** (`lib/services/notify.ts`, `patientcomms.ts`):
- **Consent:** per-patient opt-in for WhatsApp, e-mail and SMS, captured at the front desk (who and when are recorded; DPDP-aligned). Settings → Notifications has the hospital-level toggles.
- **What is sent:**
  - token, consultation done and next step;
  - prescription summary;
  - lab report ready;
  - payment receipt;
  - discharge;
  - medicine reminders;
  - follow-up offers and confirmations.
- **How it is sent:** everything goes through `notification_outbox` and the worker `/api/cron/outbox`, which uses skip-locked claims and dedupe keys, retries with backoff (2/4/8/16 min, up to 5 attempts) and re-checks consent at send time.
- **Dry-run:** when provider keys are missing, rows become `not_sent` with "not sent: provider not configured". Delivery is never faked.
- **Medicine reminders:** built from each prescription line's frequency (1-0-1, OD/BD/TDS/QID/HS), duration and before/after-food note, using the hospital's dose times (default 08:00/14:00/21:00 IST, plus an optional evening slot) and food offset (default 30 min). One message goes out per due slot listing the medicines due then, and the dose count is preserved.
  - A reminder more than `REMINDER_LATE_MINUTES` (90) late is skipped, not sent late.
  - Replying TAKEN logs adherence; replying STOP withdraws WhatsApp consent and cancels pending reminders.
- **Follow-ups are never auto-booked:**
  1. The doctor's follow-up date produces an offer that tentatively holds the first free slot (OPD hours minus appointments and other holds) for `followup_hold_hours` (default 24). The hold is not an appointment.
  2. The patient gets WhatsApp buttons (Confirm / Another time / Cancel) or signed one-time e-mail links (`/followup`, POST-only).
  3. **Confirm** creates the appointment and sends a confirmation. **Another time** offers the next free slots over 7 days, or flags reception.
  4. If there is no reply, one reminder goes out at half the hold window, and after that the request is flagged on /followups for reception to book.
- **Staff view:** a per-patient message log at `/messages?patient=<id>` (assistant → Message log).
- **Scheduling (important):** Vercel Hobby runs crons at most once a day. `vercel.json` therefore runs the outbox once daily as a safety sweep, which is NOT enough for dose-time reminders. To hit dose slots, call `GET /api/cron/outbox` with `Authorization: Bearer $CRON_SECRET` every 5 minutes, either with Vercel Pro (change the schedule to `*/5 * * * *`) or with an external scheduler (cron-job.org, Upstash QStash, GitHub Actions).

**WhatsApp setup (Meta Cloud API)**
1. Meta Business Manager → WhatsApp → add a phone number and get `WHATSAPP_PHONE_NUMBER_ID`, then create a permanent System User token (`WHATSAPP_TOKEN`).
2. Create templates (category *Utility*, language English or Hindi) with a single body variable `{{1}}`. For follow-ups and reminders, add quick-reply buttons: `followup_offer` with Confirm / Another time / Cancel, `med_reminder` with Taken. Submit them for approval (usually minutes to 24 h).
3. Enter the approved template names in Settings → Notifications. Without a template, Meta delivers only inside the 24-hour customer-service window.
4. Webhook: set the callback URL to `https://<app>/api/webhooks/whatsapp`, with verify token `WHATSAPP_VERIFY_TOKEN` and app secret `WHATSAPP_APP_SECRET` (signatures are verified; the webhook refuses requests if it is missing). Subscribe to `messages`.

New env vars:
- `APP_BASE_URL` (link host; defaults to the Vercel production URL)
- `LINK_SECRET` (signs e-mail links; falls back to SESSION_SECRET)
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `TECH_ALERT_EMAIL`
- `GITHUB_ISSUES_TOKEN`, `GITHUB_ISSUES_REPO`
- `INCIDENT_NOTIFY_PER_HOUR`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_API_VERSION` (v21.0), `WHATSAPP_TEMPLATE_LANG` (en)
- `REMINDER_LATE_MINUTES`

## AI doctor assistant (doctor-in-the-loop)
Assistive only — **not a diagnostic or treatment device**. Every output is labelled **"AI suggestion – verify"**. Nothing goes into the clinical record or out to a patient until a clinician accepts it: accepting only fills the form; the record is saved when the doctor clicks *Finish*, and patient messages go through the consent-gated outbox only after acceptance.

**Turning it on:** AI + Customer Engagement plan → Settings → AI: enable, tick "patients are informed…", set the monthly token cap (default 200,000 tokens per hospital per month; the assistant returns 429 when it is reached). Configure `LLM_PROVIDER`, `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` (+ `LLM_API_VERSION` for Azure, `LLM_TIMEOUT_MS`). Without a provider, the deterministic parts still work: lab flags and trends, history card, ICD-10 table matching, and prescription safety checks.

**Features** (Doctor desk → AI panel): lab/radiology summary (flags and trends computed in code from reference ranges; the LLM only phrases the text) · history card · Rx suggestions with deterministic safety checks (allergy, duplicate therapy, drug interactions, age/weight dose limits; blocking warnings must be ticked before you can accept) · ICD-10 plus suggested tests · discharge summary draft (`POST /api/ai/discharge`) · voice dictation (Web Speech API, English/Hindi; works in Chrome/Edge) structured into fields · patient-friendly English/Hindi rewrite.

**Privacy and safety:** names, phone numbers, addresses, e-mail and ABHA/Aadhaar are removed, and free text is scrubbed, before any call; the patient's own name is masked. OpenAI-compatible requests send `store:false`. With Azure OpenAI, use a deployment with abuse-monitoring/data-retention opt-out where it is available. Record and report text is wrapped as untrusted data, and the model is told never to follow instructions inside it. Every call is audited (`ai_call`, then `ai_accepted` / `ai_edited` / `ai_rejected`), and token use is tracked in `ai_usage`. The clinician stays responsible for every decision. Check the CDSCO medical-device software guidance before marketing any diagnostic claims.

## Efficiency features (Queue 3)
- **QR self check-in:** Settings → Self check-in QR. Off by default. The rotating per-hospital key is in the QR. Patients enter their mobile number plus date of birth or UHID; 5 failed tries in 15 minutes locks that number. New patients still register at the desk.
- **WhatsApp booking:** off by default. When a patient sends `BOOK`, they get the next 3 free slots as buttons. Needs `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`, plus the webhook URL set to `/api/webhooks/whatsapp` in Meta.
- **Templates / order sets** and **Repeat last Rx** on the Doctor desk. Repeat runs the deterministic safety checks, and blocking warnings must be confirmed.
- **TV token display:** open `/display?h=CODE&k=KEY` (the link is on the QR page) and tap Start for the chime and voice. It shows token numbers and doctor names only. A "turn is near" message goes to the patient N places away, only if they consented.
- **Lab analyser import:** `POST /api/integrations/lab-results` with `Authorization: Bearer hmslab_…` (create the key in Lab → Analyser connection). Accepts HL7 v2 ORU^R01 or CSV. Results stay *pending verification* until lab staff verify them.
- **Pharmacy reorder:** stock alerts (reorder level, days of cover, expiry), suppliers, draft POs, goods receipt into batches. The daily lifecycle cron can auto-draft POs. Nothing is sent to suppliers automatically.
- **Insurance:** auto-fill from records, document checklist, and a one-file PDF claim packet (`/api/claims/:id/packet`).
- **Daily close-out:** Settings → Daily close-out. The report is sent by the outbox worker at the chosen IST time; it is a dry-run ("not sent") without `RESEND_API_KEY` + `EMAIL_FROM` or WhatsApp keys.
- **Offline front desk:** a service worker plus an IndexedDB queue. Registrations made offline sync automatically, using the same Idempotency-Key so they never duplicate.
- No new env vars beyond the existing ones (`APP_BASE_URL` is used for the QR link).
