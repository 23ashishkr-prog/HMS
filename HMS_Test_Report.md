# HMS (greynova.in/hms) — Test Report

**Tenant:** Sudipta_Test · **Date:** 1 Nov 2026 · **Tested as:** Admin (Ashish)
**Status:** All 7 roles tested ✅ (Admin, Reception, Doctor, Nurse, Lab, Pharmacy, Billing)

## Summary
- **7 High, 16 Medium, 16 Low** findings across 7 roles.
- **Fix first:**
  1. **H8:** Billing can change payment-gateway keys.
  2. **H7:** Pharmacy can dispense the wrong drug with no warning.
  3. **H6:** The child dose check ignores the entered weight.
  4. **M2:** Every OPD visit is billed as an Emergency consultation (₹1,000).
  5. **H1:** The billing preview under-states pharmacy charges.
- **Role security is strong:** every role's blocked pages and admin APIs were refused by the server, not just hidden.
- **Speed:** every page loads in 0.4–0.8 s (Settings 1.2 s). The biggest win is to **run the server in Mumbai (`bom1`) instead of Washington DC (`iad1`)**, which would make each API call about 5× faster (300 ms → about 50 ms).

---

## 1. Errors found

Severity: **High** = wrong data, money or patient safety · **Medium** = wrong behaviour or confusing · **Low** = cosmetic or UX

### High
| # | Module | Error | How to reproduce | Suggested fix |
|---|---|---|---|---|
| H8 | Settings → Payments (security / finance) | The **Billing** role can edit the hospital's payment gateway: Razorpay Key ID, Key Secret, Webhook Secret, Test/Live mode, Enabled. A billing staffer could enter their own Razorpay keys so patients' online payments go to their account. (Not saved during testing.) | Sign in as billing → Settings → Payments. | Make gateway configuration admin-only (server and UI); log and alert admin on any change. |
| H7 | Pharmacy (patient safety) | The pharmacist can map a prescribed drug to **any** stock item with no warning (tested: Rx "Amlodipine 5mg" mapped to Ibuprofen 400mg, and "Mark dispensed" stayed enabled, no message). Wrong-drug dispensing isn't prevented. | Open an Rx → pick a different medicine in Stock item. | Auto-map by name/generic; require a reason or confirmation when the stock item doesn't match the prescribed drug. |
| H6 | Doctor desk (patient safety) | The child dose check keeps showing "⚠ Child (8 y): record weight to check the Amoxicillin syrup dose" even after weight is entered (26 kg, typed by hand). The check ignores the weight on the form, so the mg/kg dose is never validated. | Child patient → enter Wt → prescribe Amoxicillin syrup. | Compute the check from the current form's weight, not the saved vitals. |
| H1 | Billing | "Total pending" preview under-states pharmacy charges: Metformin shown as ₹3.00 and total ₹1,303, while the real invoice is 60 × ₹3 = ₹180, total ₹1,480. | Dispense 60 tabs → Billing → search patient. | Use `qty × rate` in the pending summary (same query as the invoice). |
| H2 | Doctor desk | A completely empty consultation (no complaint, diagnosis, vitals or Rx) saves and marks the patient "Seen". | Open a token → Finish & next without typing. | Require at least a diagnosis or chief complaint. |
| H4 | Front desk (offline) | When the save reaches the server but the reply is lost, the replay shows "Possible duplicate … same phone and name" instead of recognising its own request. Staff may register the patient twice. | Lose the network during "Register & issue token". | Have the server honour the idempotency `key` already sent by the client and return the original result. |
| H5 | Security / caching | All `/api/*` responses (patient data) are sent with `Cache-Control: public, max-age=0, must-revalidate`. `public` allows shared or proxy caches to store patient data. | Check response headers. | Use `private, no-store` on authenticated API responses. |

### Medium
| # | Module | Error |
|---|---|---|
| M1 | Schedules | A doctor with no OPD sessions showed "Available now" on a Sunday. The status ignores the schedule. |
| M2 | Front desk | **Root cause found:** every front-desk visit is billed as **"Emergency consultation" ₹1,000**, not General ₹500 / Specialist ₹800 / Follow-up ₹300. Every OPD patient is over-charged by ₹200–700. Map the fee to the doctor and visit type. |
| M3 | Front desk | Check-in to an "off duty" doctor is allowed with no warning. |
| M4 | Lab / Pharmacy | When the admin consults, the ordering doctor is saved as "Ashish" / "Dr Ashish" instead of the patient's treating doctor. The admin also gets a "Dr" prefix. |
| M5 | Doctor desk | "Finish & next" auto-opens the next patient and sets them to "Consultation" (seen for admin and doctor). Admin's "Finish & next" auto-opens another doctor's patient and sets it to "Consultation". "Close" leaves it stuck there (Arjun Mehta). |
| M6 | Pharmacy | The supplier form accepts phone "12" and email "not-an-email" (the email field is type=text). GSTIN is validated correctly. |
| M7 | Billing | "Create invoice" on a patient with nothing unbilled creates an empty ₹0 open invoice. |
| M8 | Daily close-out | Lab shows Ordered 6, Reported 3, Pending 4. Pending counts older orders while Ordered counts only today, so the numbers don't add up. |
| M9 | Front desk | The Today's queue on screen doesn't refresh after an offline item syncs (it needs a reload). |
| M11 | Privacy | Reception **and Lab** can read a patient's clinical notes (diagnosis and Rx summary) via `GET /api/patients/{id}` (`notes[]`). Front-desk staff shouldn't see clinical content; return notes only to doctor and nurse roles. |
| M12 | IPD (functional gap) | The nurse's IPD screen is view-only: no ward vitals chart, nursing notes, medication administration record (MAR) or intake/output for admitted patients. These are a nurse's core in-patient tasks. |
| M13 | Lab | The same lab user can upload **and** verify a report (no maker-checker). Consider requiring a second user (pathologist) to verify. |
| M14 | Lab | No turnaround or overdue alert: an X-ray for Manjunath Gowda has been "Ordered" since 22 Oct (10 days) with no flag. Critical results (e.g. Dengue NS1 POSITIVE, platelets 92,000) aren't flagged or pushed to the doctor. |
| M15 | Security | `GET /api/hospital/gateway` returns internal server config text: "encryption derived from SESSION_SECRET (set INTEGRATIONS_ENC_KEY)". It also shows a dedicated encryption key isn't configured, so gateway secrets are encrypted with a key derived from the session secret. Set `INTEGRATIONS_ENC_KEY` and remove the message from the API. |
| M16 | Billing | Invoices are titled "GST invoice" but no GST is calculated on pharmacy items (medicines usually carry 5–12 % GST). Confirm tax setup. |
| M17 | Billing | Payment gateway shows `enabled: true` and status "configured" while `configured: false` and no keys are saved. Online pay may be offered on bills but can't work. |

### Low
| # | Module | Error |
|---|---|---|
| L1 | Everywhere | Error toasts never dismiss, stay visible after switching tabs, and hide later success messages. |
| L2 | Schedules / Billing | Save schedule and Record payment show no success message. |
| L3 | Doctor desk | The sticky Queue panel overlaps the consultation form at about 870 px width. |
| L4 | IPD | Beds sort as G1, G10, G2… (text sort). Use natural sort. |
| L5 | Appointments | A doctor on leave shows "No open hours set" instead of "On leave: CME conference". |
| L6 | Lab | Results are free text only, with no parameters, units, reference ranges or High/Low flag. |
| L7 | Audit log | Clicking favourites (`/api/me/favourites`) is logged as `admin_action`, which is noise. |
| L8 | Accessibility | Collapsed sidebar icons have no accessible name or link (keyboard and screen-reader users are lost). |
| L10 | Access | Opening a blocked page (e.g. /hms/pharmacy as reception) silently redirects to Front desk with no "You don't have access" message. |
| L11 | Appointments | Booking an appointment shows no confirmation message. |
| L12 | Doctor desk | "+ Save current as template" does nothing visible (no dialog, no message). |
| L13 | Speed | A blocked page fully loads its 10–15 API calls before redirecting. Check the role before fetching data. |
| L14 | Doctor desk | (Corrected from High) The vitals form doesn't warn on impossible values (Temp 55, SpO₂ 150, Pulse −5) while typing. **The server does reject them on save** (Temp 25–45, SpO₂ 50–100, Pulse 20–250, BP sys 50–260). Add the same min/max to the inputs for instant feedback. |
| L15 | Pharmacy | Prescription list shows "Dr QA Doctor" / "Dr Ashish" ("Dr" added to every name). |
| L16 | Billing | The Billing role can't open Daily close-out, which is usually a cashier's end-of-day task. Consider allowing read-only access. |
| L9 | Routes | `/hms/documents` and `/hms/day` render blank without parameters; show a message or redirect instead. |

### What worked correctly
Duplicate service code, negative price, duplicate bed, expired batch, zero quantity, insufficient stock, discount over the bill, overpayment, double IPD admission, leave date range, invalid mobile and invalid GSTIN were all rejected with clear messages. Double-booking an appointment slot isn't possible. In Settings, Billing sees only the Payments tab (Users, Subscription and Services are hidden and refused). The audit log records every action with user and time.

---

## 2. Speed: why it's slow and how to make it fast for every user

### Measurements
- Every page is usable in **0.4–0.8 s** (warm cache). The HTML arrives in about 90 ms and the JavaScript (~550 KB) is cached correctly for a year.
- **Each API call takes about 300 ms, but the server's own work is only 14–47 ms** (`Server-Timing: app;dur=17`).
- The response header shows `x-vercel-id: bom1::iad1`. Users hit the **Mumbai** edge, but the code runs in **Washington DC (iad1)**, so every call crosses the world twice.
- Each page makes 5–9 API calls. The dashboard calls `/api/subscription/status` 2× and `/api/me/favourites` 3×, and every page calls `subscription/status` and `auth/me` again.

### Fixes, biggest gain first
| # | Change | Expected gain |
|---|---|---|
| P1 | **Move the Vercel functions to Mumbai (`bom1`) and keep the database in India** (Supabase/Neon `ap-south-1`). In `vercel.json`, set `"regions": ["bom1"]`. | ~300 ms to ~40–60 ms per call, **about 5× faster everywhere** |
| P2 | Load `auth/me` + `subscription/status` + `favourites` **once per session** (React context or SWR with a long cache), not on every page. Remove the duplicate calls. | 2–4 fewer calls per page |
| P3 | Combine each page's start-up calls into one endpoint (e.g. `/api/frontdesk/bootstrap` returns queue + doctors + fee). | 1 round trip instead of 5–7 |
| P4 | Use stale-while-revalidate: show the last data at once (the front desk already caches `fd.cache`; do this on all pages) and refresh in the background. | Pages feel instant |
| P5 | The patient dropdowns (Appointments, IPD admit) load **all** patients. Replace them with type-ahead search (`/api/patients?q=` already exists). | Stays fast at 10,000+ patients |
| P6 | Poll `/api/home/live` only while the tab is visible, or use realtime push. | Less server load |
| P7 | Split the JavaScript per role so Lab and Pharmacy users don't download Doctor desk, Billing and so on. | Faster first load on slow hospital Wi-Fi |

---

## 3. Fewer steps: what to simplify or remove

| Workflow | Today | Proposal | Steps saved |
|---|---|---|---|
| Pharmacy dispense | Pick the stock item by hand for each Rx line, type the quantity by hand | Doctor picks the medicine from stock (autocomplete) so it's pre-linked; quantity auto-calculated from frequency × days (1-0-1 × 30 = 60), editable | 2 per medicine |
| Lab | "Collect sample" then "Enter result" separately for each test | "Collect all" per patient; result entry opens straight after collection | 1 per test |
| Billing | Search patient in the top bar → "Bill all pending" → choose mode → Record | Auto-bill lab and pharmacy charges as they're completed; one "Collect ₹X · CASH/UPI/CARD" button on the patient | 2–3 per patient |
| Billing | Separate "Create invoice" list that can make ₹0 invoices | Remove it; only allow a manual bill when items are added | Fewer mistakes |
| Doctor hours | Edited in 2 places (Doctor schedules **and** Appointments → Doctor availability) | Keep only Doctor schedules; Appointments reads from it | 1 screen fewer, no conflicts |
| Add doctor | 2 places (Users & Access **and** Appointments → Add doctor) | Keep only Users & Access | Less confusion |
| Appointments | Choose doctor → date → patient from a long list → slot → Book | Patient search box first; "next free slot" button | 2 |
| Front desk | Fee fixed at ₹1,000 | Auto-select the fee from the doctor (General/Specialist) and Follow-up (₹300) if seen in the last 7 days | Fewer refunds and corrections |
| Doctor desk | Admin "Finish & next" jumps to other doctors' patients | "Next" only within the same doctor's queue | Fewer errors |

---

## 4. Data created during testing
- **Schedule:** QA Doctor Mon–Sat 09–13 & 17–20 (15-min slots). **Leave:** Dr. Vikram Reddy 9–10 Nov.
- **Services:** VITD ₹1,200, CRP ₹450, CT-HEAD ₹3,500, PLASTER ₹800, AMB ₹1,500.
- **Beds:** SP1, SP2 (semi-private ₹2,000), ICU3, giving 19 beds.
- **Medicines:** Metformin 500mg (300), Amlodipine 5mg (200), ORS (100), Ondansetron 4mg (150).
- **Suppliers:** Sri Lakshmi Pharma Distributors, MedPlus Wholesale.
- **Patients (test mobiles 90000001xx):** Lakshmi Narayanan, Ramesh Kulkarni, Fatima Sheikh, Arjun Mehta, Sunita Devi, Joseph Fernandes.
- **Full flow for Ramesh:** diabetes consultation, then 3 lab results, then Metformin ×60 dispensed, then invoice INV/2026/000012 for ₹1,400, paid.
- **Other records:** Lakshmi admitted to SP1 (IP/2026/00001). Appointments: Aarohi on 2 Nov 10:00 with Dr. Ananya; Fatima on 11 Nov 11:00 with Dr. Vikram.

**Please clean up:** the empty invoice INV/2026/000011 (Joseph, ₹0) and the supplier "ZZ Invalid Contact Test" (test records).

## 5. Role test results

### Reception (qa+reception@greynova.in) ✅
**Menu:** Home, Front desk, Billing, IPD beds, Patients, Appointments, Doctor schedules, Follow-ups, Self check-in QR. This matches the role definition.

| Test | Result |
|---|---|
| Register a new walk-in (Priya Raghavan, F34) → QA Doctor, UPI | ✅ Token #3, UHID SUDIPTATES-26-000012, invoice paid ₹1,000 |
| Re-register the same name + mobile | ✅ Blocked: "Possible duplicate … select the existing patient"; the existing patient is suggested while typing |
| Collect Arjun Mehta's "Bill later" fee | ✅ Bill all → Collect · CASH → INV/2026/000014 paid. ⚠ Line is "Emergency consultation ₹1,000" (see M2) |
| Discount / cancel invoice | ✅ Not shown to reception |
| Book appointment: Joseph Fernandes → QA Doctor, 2 Nov 09:00 | ✅ Booked (28 → 27 free slots); no confirmation message (L11) |
| Doctor schedules | ✅ Read-only (no Save / Add leave) |
| IPD | ✅ Can Admit; cannot Add bed |
| Blocked pages via URL (OPD, Pharmacy, Lab, Insurance, Settings, Audit, Close-out, Import) | ✅ All redirect to Front desk (L10: no message) |
| Server-side permissions: 14 admin/pharmacy/lab GET endpoints | ✅ 403 for audit, import, pharmacy/*, lab imports, claims, setup, lab-key, gateway, report-files |
| Server-side permissions: 7 admin-only POST endpoints (add doctor, supplier, stock, service, setup, lab-key, bed) | ✅ All 403 "Your role (reception) cannot perform this action" |
| Patient record API | ⚠ Returns clinical notes to reception (M11) |
| Page speed (reception) | Dashboard 502 ms · Front desk 390 · Billing 487 · IPD 388 · Patients 393 · Appointments 391 · Schedules 604 · Follow-ups 702 (10 API calls) · Check-in QR 519 |

**Created by reception:** patient Priya Raghavan (000012, token #3 for QA Doctor), INV/2026/000014 (Arjun, paid cash), appointment Joseph → QA Doctor 2 Nov 09:00.

### Doctor (qa+doctor@greynova.in) ✅
**Menu:** Home, Doctor desk, IPD beds, Patients, Appointments, Doctor schedules, Follow-ups. This matches the role definition.

| Test | Result |
|---|---|
| Queue shows only own patients (Arjun, Sunita, Priya) | ✅ |
| Consult Arjun Mehta (8 y): URTI J06.9, Amoxicillin syrup 5 ml TDS × 5 d, CBC, follow-up 7 d | ✅ Saved. ⚠ Child-dose check ignores the entered weight (H6) |
| Consult Sunita Devi (67 y): Hypertension I10, BP 164/96, Amlodipine 5mg OD × 30 d, ECG + KFT, follow-up 15 d | ✅ Saved; note recorded as "QA Doctor" (correct, unlike the admin case M4) |
| Queue panel overlapping vitals | ⚠ Still happens (L3) |
| Save as template | ⚠ No response (L12) |
| Open another doctor's patient (Ramesh) via API | ✅ 404 (doctors only see their own patients) |
| `/api/frontdesk` as doctor | ✅ Only own queue returned |
| Doctor schedules | ✅ Only own schedule shown and editable; editing another doctor's schedule via API → 404 |
| Blocked pages (Front desk, Billing, Pharmacy, Lab, Insurance, Settings, Audit, Close-out) | ✅ Redirect to Doctor desk (⚠ L13: data is loaded first) |
| Server-side permissions: 12 GET + 7 POST admin/billing/pharmacy/front-desk endpoints | ✅ All 403 (or 400/404) |
| Page speed (doctor) | Dashboard 399 ms · Doctor desk 401 · IPD 404 · Patients 395 · Appointments 395 · Schedules 415 · Follow-ups 496 |

**Created by doctor:** consultations for Arjun and Sunita; lab orders CBC (Arjun), ECG + KFT (Sunita); prescriptions Amoxicillin syrup (Arjun), Amlodipine (Sunita). Priya Raghavan left for the Nurse test.

### Nurse (qa+nurse@greynova.in) ✅
**Menu:** Home, Doctor desk, IPD beds, Patients. This matches the role definition.

| Test | Result |
|---|---|
| Doctor desk shows a nurse-only view (Vitals + "What you observed or did" + Save) with no diagnosis or Rx | ✅ Good role design |
| Record Priya Raghavan's triage vitals (37.4 °C, 88, 118/76, SpO₂ 99, 61 kg, 163 cm) + note | ✅ "Vitals and note saved"; patient stays in QA Doctor's queue |
| Nurse calls finish / prescribe / diagnosis on the visit API directly | ✅ 403 "Your role (nurse) cannot perform this action" |
| Impossible vitals sent straight to the API | ✅ 400 with clear range messages (see L14) |
| IPD: view Lakshmi Narayanan in SP1 | ✅ Visible, ⚠ no nurse actions at all (M12) |
| Blocked pages (Front desk, Billing, Pharmacy, Lab, Appointments, Schedules, Settings) | ✅ Redirect to Doctor desk |
| Server-side permissions: 10 GET + 6 POST | ✅ All 403 (front-desk queue readable, which is needed for triage) |
| Page speed (nurse) | Dashboard 446 ms · Doctor desk 514 · IPD 430 · Patients 406 |

**Created by nurse:** triage vitals and note for Priya Raghavan.

### Lab (qa+lab@greynova.in) ✅
**Menu:** Home, Lab worklist. This matches the role definition.

| Test | Result |
|---|---|
| Worklist shows 5 lab orders (Fatima ×3 from admin, Arjun CBC, Sunita KFT from QA Doctor) | ✅ Ordering doctor shown correctly for QA Doctor's orders |
| Collect 5 samples → enter 5 results (Enter to save) | ✅ All "Updated"; 5 clicks plus 5 results took about 7.5 s of clicking (see section 3: "Collect all") |
| Radiology tab: ECG report for Sunita | ✅ Saved |
| Upload report: .txt file | ✅ Rejected "Only PDF, PNG, JPEG or WebP" |
| Upload report: 4.5 MB PDF | ✅ Rejected "File is larger than 4 MB" |
| Upload report: plain text renamed .pdf | ✅ Rejected (server checks file content) |
| Upload real PDF → Verify | ✅ "Report uploaded — verify it to release" → "Report verified". ⚠ Same user can verify (M13) |
| Old pending order (X-ray from 22 Oct) | ⚠ No overdue flag (M14) |
| Blocked pages (Front desk, OPD, Billing, Pharmacy, Patients, IPD, Settings) | ✅ Redirect to Lab worklist |
| Server-side permissions: 10 GET + 6 POST | ✅ All 403. ⚠ Patient record API returns clinical notes (M11) |
| Page speed (lab) | Dashboard 440 ms · Lab worklist 437 ms |

**Created by lab:** results Fatima CBC (TLC 3,200, platelets 92,000), Dengue NS1 POSITIVE, MP negative; Arjun CBC; Sunita KFT normal; Sunita ECG (LVH) with uploaded and verified PDF.

### Pharmacy (qa+pharmacy@greynova.in) ✅
**Menu:** Home, Pharmacy. This matches the role definition.

| Test | Result |
|---|---|
| Pending prescriptions: Fatima, Arjun, Sunita | ✅ Listed |
| Dispense Fatima: Paracetamol 650mg ×9 + ORS ×3 | ✅ "₹82.5 added to the patient's bill" (9×2.5 + 3×20, correct) |
| Dispense Arjun: Amoxicillin syrup ×1 | ✅ ₹68 |
| Dispense Sunita: Amlodipine 5mg ×30 | ✅ ₹120 |
| Stock deducted | ✅ Amlodipine 200→170, Amoxicillin 199→198, ORS 100→97, Paracetamol 191→182 |
| Stock item pre-selected / quantity pre-filled | ⚠ Neither: every line needs a manual pick and a typed quantity (section 3) |
| Wrong drug selected (Ibuprofen for an Amlodipine Rx) | ❌ No warning (H7) |
| Re-dispense an already-dispensed Rx | ✅ No "Mark dispensed" button |
| Blocked pages (Front desk, OPD, Billing, Lab, Patients, Settings) | ✅ Redirect to Pharmacy |
| Server-side permissions: 10 GET + 6 POST | ✅ All 403 |
| Page speed (pharmacy) | Dashboard 399 ms · Pharmacy 608 ms |

**Created by pharmacy:** dispensed Fatima (₹82.50), Arjun (₹68), Sunita (₹120), all now pending in Billing.

### Billing (qa+billing@greynova.in) ✅
**Menu:** Home, Billing, IPD beds, Patients, Insurance / TPA, Settings. This matches the role definition.

| Test | Result |
|---|---|
| Fatima: pending preview | ❌ Shows ₹1,172.50; real invoice ₹1,232.50 (H1 reproduced: pharmacy shown at unit price) |
| Fatima: Bill all → discount ₹32.50 → Collect · CARD | ✅ INV/2026/000015, Net ₹1,200, paid |
| Sunita: Bill all → UPI ₹1,000 (UTR) + Collect · CASH ₹120 | ✅ Net ₹1,120, paid (split payment works) |
| Arjun: Bill all → Collect · UPI | ✅ ₹418 paid |
| Discount / Cancel invoice available to billing | ✅ Yes (correct for this role) |
| Settings tabs visible | ✅ Only "Payments" (no Users & access, Subscription, Services…) |
| Settings → Payments | ❌ Can change Razorpay keys and Live mode (H8); API leaks encryption config (M15) |
| Users API / Add doctor / change prices / subscription checkout | ✅ 404 / 403 |
| Blocked pages (Front desk, OPD, Pharmacy, Lab, Appointments, Audit, Close-out, Import) | ✅ Redirect to Billing |
| Server-side permissions: 13 GET + 8 POST | ✅ Refused except invoices and claims (needed) |
| Page speed (billing) | Dashboard 496 ms · Billing 397 · IPD 509 · Patients 510 · Insurance 523 · **Settings 1,205 ms (slowest page in the app)** |

**Created by billing:** INV/2026/000015 Fatima ₹1,200 (card), Sunita ₹1,120 (UPI + cash), Arjun ₹418 (UPI).

### Access summary (server-side)
| Role | Pages allowed | Blocked pages redirect | Admin APIs refused | Notes |
|---|---|---|---|---|
| Reception | 9 | ✅ 8/8 | ✅ | Reads clinical notes (M11) |
| Doctor | 7 | ✅ 8/8 | ✅ | Sees only own patients and schedule |
| Nurse | 4 | ✅ 7/7 | ✅ | Can't finish, prescribe or diagnose (verified on the API) |
| Lab | 2 | ✅ 7/7 | ✅ | Reads clinical notes (M11) |
| Pharmacy | 2 | ✅ 6/6 | ✅ | Wrong-drug mapping (H7) |
| Billing | 6 | ✅ 8/8 | ✅ | Can edit payment gateway (H8) |
