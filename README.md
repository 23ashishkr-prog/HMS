# HMS: multi-tenant Patient Management System (India)

A Next.js 16 + Postgres SaaS PMS. Many hospitals share one deployment, and each hospital (tenant) has its own users and isolated data.

Modules: registration (UHID + ABHA), appointments, OPD token queue, consultation EMR (vitals, ICD-10, Rx, orders), lab/radiology worklist, pharmacy inventory and dispensing, billing and payments, IPD beds/admission/discharge, insurance/TPA, audit log, live dashboard, plans/subscriptions, and a platform super-admin console.
See `docs/WORKFLOW_GAP_ANALYSIS.md` for what's built and what's left.

**No demo data.** Every screen reads and writes through `/api/*` against your database. The only seeded rows are subscription plans (master data).

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
   - `RUN_MIGRATIONS=true`: applies `db/migrations` during each build (`vercel-build` script). Or run `npm run db:migrate` yourself once against the database.
   - Optional: `TRIAL_DAYS`, `ALLOW_PUBLIC_SIGNUP`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `WHATSAPP_*`
   - Use a **separate database for Preview** if you don't want preview builds to migrate production.
2. Redeploy. Then open `/onboarding` to create a hospital, or keep using your existing admin login (existing hospitals are moved to the Enterprise plan).
3. Razorpay (later): create subscription plans in Razorpay with `notes.hospital_id` and `notes.plan_code`, then point the webhook to `/api/subscription/razorpay/webhook`. Nothing is charged or faked until the keys are set.

## WhatsApp
`/api/whatsapp/send` sends through Meta WhatsApp Cloud API. Get patient consent and use approved templates.
