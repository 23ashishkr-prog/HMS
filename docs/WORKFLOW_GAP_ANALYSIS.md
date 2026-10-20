# Workflow gap analysis: HMS vs market PMS/HMS

Benchmarks: Epic and Oracle Health (Cerner) for enterprise EMR patterns; OpenMRS and Bahmni (open source, used widely in India) for registration, OPD, orders and IPD; Practo Insta, KareXpert and eHospital (NIC) for Indian specifics such as UHID, ABHA/ABDM, GST billing, TPA and PM-JAY. Only the common, publicly documented workflows are reproduced. No proprietary code or content is used.

Status key: ✅ built in this branch · 🟡 partial · ❌ not yet

| # | Workflow (benchmark) | Before this branch | Now | Remaining gap |
|---|---|---|---|---|
| 0 | **Multi-tenant SaaS** (KareXpert/Insta cloud model) | `hospital_id` columns, but one hospital was hard-coded in seed SQL | ✅ Self-service onboarding (`/onboarding`) creates the tenant, first admin and a trial. Every service query is filtered by the session's `hospital_id` (central `lib/api.ts` + `lib/services/*`). Per-tenant UHID, invoice and admission sequences. Tests prove isolation. | 🟡 Postgres RLS isn't on yet (the app enforces isolation centrally); adding RLS with `set_config('app.hospital_id')` per transaction is the next hardening step |
| 0b | **Subscriptions** | none | ✅ `plans` (Basic/Pro/Enterprise: module flags and user/patient limits), `subscriptions` (trialing/active/past_due/cancelled/expired), a module gate on each API (HTTP 402), limits enforced, Razorpay webhook with HMAC verification (disabled until env vars are set), and a platform super-admin console at `/platform` | ❌ Razorpay checkout and plan purchase UI. Plan prices are ₹0 placeholders for the owner to set. |
| 0c | **Tenant settings** | name/logo/colours | ✅ address, GSTIN (validated), UHID prefix, contact details | |
| 1 | **Patient registration**: UHID and ABHA (eHospital, Bahmni) | Edit-only. No way to register patients. Demo patients came from SQL. | ✅ Registration with auto UHID `PREFIX-YY-NNNNNN`, ABHA number (14-digit, formatted) and ABHA address (`x@abdm`), duplicate-ABHA check, Indian mobile normalisation, ID proof, emergency contact, allergies, search by name/UHID/mobile/ABHA | ❌ Live ABDM gateway (ABHA creation/verification, consent, HIP linking) needs ABDM sandbox credentials |
| 2 | **Appointments and queue/token** (Practo Insta) | Doctor calendar and booking existed. The queue had no tokens and no check-in. | ✅ Reception check-in issues a per-doctor daily token (IST date), links the appointment, and blocks duplicate tokens. Queue states go waiting → consultation → checked. | 🟡 TV token display and SMS/WhatsApp templates |
| 3 | **OPD consultation/EMR** (OpenMRS encounter model) | Free-text note only. The `/clinical` page was a mock (`alert`). | ✅ Encounter linked to the token: vitals (T/P/BP/RR/SpO₂/Wt/Ht, validated), ICD-10 diagnoses (provisional/final), structured multi-line prescription, chief complaint/history/examination/advice/follow-up. Closing the encounter writes the summary to history. | 🟡 ICD-10 lookup list, templates/favourites, printable Rx with letterhead |
| 4 | **IPD**: admission, beds, discharge (Bahmni IPD) | none | ✅ Bed master, live bed board, admission number, one active admission per bed and per patient, discharge summary/diagnosis/advice | ❌ Nursing notes/MAR, bed transfer, automatic bed-day charges on the bill |
| 5 | **Lab and radiology orders/results** (OpenMRS orders, Bahmni LIS) | Lab could upload a report link. No orders. | ✅ Doctor orders from the catalogue with priority (routine/urgent/stat). Lab worklist: collect sample → enter result (radiology: report). Results show up in the encounter. | 🟡 Parameter-level results with reference ranges, barcode labels, HL7/ASTM analyser interfacing, PACS |
| 6 | **Pharmacy and inventory** | Read-only prescription view | ✅ Medicine master, GRN batches with expiry, stock on hand, reorder flag, dispense with FEFO deduction and an insufficient-stock guard | ❌ Purchase orders/suppliers, returns, pharmacy billing with GST/HSN |
| 7 | **Billing** | **Hard-coded mock** (`INV-2026-1004`, ₹2,450) | ✅ Invoices numbered per tenant, line items from the service price list or custom, discount, partial/full payments (cash/UPI/card/netbanking/insurance), balance, cancel guard, printable | ❌ GST tax lines/e-invoice, refunds, advance/deposit, package billing |
| 8 | **Insurance/TPA** (KareXpert TPA desk, PM-JAY) | none | ✅ Pre-auth → approval → claim submission → settled/rejected state machine with approved amounts, linked to an admission or invoice | ❌ Document uploads, NHCX/PM-JAY TMS integration |
| 9 | **Auth, RBAC, audit** | JWT cookie, 6 roles, demo users with a shared password in SQL | ✅ Roles admin/doctor/nurse/reception/lab/pharmacy/billing plus platform super-admin. Role and active status are re-checked against the DB on every API call. Hospital code at login when one email exists in several tenants. Admin staff management with plan user limits. Audit log of every write, with a viewer. | 🟡 Forced password change on first login, 2FA, password reset email |
| 10 | **Dashboard** | Built from the demo rows | ✅ Live counts: patients, registrations today, OPD today, waiting, appointments, inpatients/beds, pending orders, collections today | 🟡 Trends/charts, department-wise MIS |

## Removed mock/dummy data
- `db/demo-data.sql` (2 fake patients, queue rows, notes, a lab report and a prescription) was deleted.
- `db/bootstrap.sql` (6 demo users sharing the password `Welcome@2027`) was deleted. It's replaced by `scripts/create-admin.mjs` (from env vars) and self-service onboarding.
- The hard-coded billing invoice and the `/clinical` alert mock are gone. Both screens now go through real APIs.

## Seeded master data (the only seed)
- `plans` (Basic/Pro/Enterprise module and limit flags; prices start at ₹0 for the owner to set) in `004_saas_tenancy.sql`.
- Existing hospitals that predate SaaS get an `enterprise/active` subscription so nothing they use gets switched off.
- Roles are a Postgres enum. Departments, services/tests, beds and medicines start empty and are entered by each hospital's admin.
