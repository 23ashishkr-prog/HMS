# HMS test notes — tenant Sudipta_Test (greynova.in/hms), 2026-11-01

## Existing setup (found at start)
- Setup wizard 67%: profile, 28 services, 13 departments, staff for all roles, 16 beds, 6 medicines, QR check-in on.
- Missing: OPD timings for 1 of 4 doctors; WhatsApp/e-mail not set up.
- Users: 2 admin, 2 reception, 4 doctor, 2 nurse, 2 lab, 2 pharmacy, 2 billing.

## Role → modules (from Add user form)
- Admin: everything (Home, Front desk, Doctor desk, Billing, Pharmacy, Lab, IPD, Patients, Appointments, Schedules, Follow-ups, Insurance, Check-in QR, Close-out, Settings, Bulk import, Audit log)
- Reception: Home, Front desk, Billing, IPD beds, Patients, Appointments, Doctor schedules, Follow-ups, Self check-in QR
- Doctor: Home, Doctor desk, IPD beds, Patients, Appointments, Doctor schedules, Follow-ups (+ Medical registration no. field)
- Nurse: Home, Doctor desk, IPD beds, Patients
- Lab: Home, Lab worklist
- Pharmacy: Home, Pharmacy
- Billing: Home, Billing, IPD beds, Patients, Insurance/TPA, **Settings**

## Findings
- [Add user] Empty submit blocked by browser-native validation (Full name, Email, Password required). OK. No custom inline error text.
- [Access] Billing role is granted Settings — check it cannot reach Users & Access / Subscription.
- [A11y] Sidebar menu items are unlabeled icon buttons when collapsed (no accessible name) and expose no hrefs.
- [Schedules] QA Doctor had NO OPD sessions but showed "Available now" (on a Sunday) — status ignores schedule. BUG.
- [Schedules] Save schedule gives no success toast (button just greys out). Saved data persisted after reload. OK.
- [Schedules] Leave with To < From rejected: "End date is before start date." OK.
- [Services] Duplicate code rejected ("Service code already exists."), negative price rejected. OK.
- [IPD] Bed list sorts G1, G10, G2… (text sort, not natural). Minor.
- [IPD] Duplicate bed in same ward rejected. OK.
- [Pharmacy] Expired batch rejected; qty 0 blocked (min=1). OK.
- [Pharmacy] Error toast "Batch is already expired." never auto-dismisses and stays visible after switching tabs. UX BUG.
- [Pharmacy] Supplier: GSTIN format validated; but phone "12" and email "not-an-email" ACCEPTED (email field is type=text). BUG. Test record "ZZ Invalid Contact Test" created; no delete option in UI.
- [Front desk] Invalid mobile (5 digits) rejected: "Mobile must be a valid 10-digit Indian number". OK. Auto-converts to +91.
- [Front desk] Consultation fee shows ₹1,000 for every doctor, but General consultation = ₹500 / Specialist ₹800 / Emergency ₹1,000 in the price list. CHECK fee mapping.
- [Front desk] Allows check-in to a doctor marked "off duty" (no warning). Confirm intended.
- [Front desk] Token numbers are per doctor (several "#1" in one queue). Expected, but the combined queue is confusing without a doctor column sort.
- [Front desk] Offline queue: one POST failed client-side (browser suspended) but HAD reached the server. Replay then showed "Possible duplicate … same phone and name" warning instead of recognising its own idempotency key → user may register the patient twice. BUG (idempotency key not honoured server-side).
- [Front desk] Today's queue on screen did not refresh to include the replayed visit until reload.
- [Doctor desk] "Finish & next" with a completely EMPTY consultation (no complaint/diagnosis/vitals/Rx) saves and marks patient Seen. BUG — should require at least diagnosis or complaint.
- [Doctor desk] Vitals have no range checks (Temp 55 °C, SpO2 150 %, Pulse −5 accepted in the form). BUG.
- [Doctor desk] Rx frequency "in 1 L water" only gives a soft warning and still saves. OK-ish.
- [Doctor desk] Prescription medicine field has no autocomplete from pharmacy stock (free text) → pharmacist must re-map manually.
- [Doctor desk] Admin's "Finish & next" auto-opens the next patient of ANY doctor and sets their status to "Consultation"; "Close" leaves it stuck in Consultation (Arjun Mehta). BUG.
- [Doctor desk] Sticky Queue panel overlaps the consultation form at ~870 px width. Layout BUG.
- [Lab/Pharmacy] Ordering doctor recorded as "Ashish"/"Dr Ashish" (the admin user) — admin gets a "Dr" prefix. Should show treating doctor.
- [Lab] Results are free text only — no structured parameters, units, reference ranges or abnormal flag.
- [Pharmacy] Dispense quantity not auto-calculated from dose×frequency×days (1-0-1 × 30 d = 60). Over-stock qty (400 > 300) rejected: "Insufficient stock". OK.
- [Billing] "Total pending" preview shows Pharmacy Metformin ₹3.00 (unit price) and total ₹1,303 — real invoice line is 60 × ₹3 = ₹180, total ₹1,480. Preview BUG (could mislead cashier).
- [Billing] "Create invoice" on a patient with nothing unbilled creates an empty ₹0 open invoice (INV/2026/000011, Joseph Fernandes — created by mistake during testing; please cancel it).
- [Billing] Discount > bill rejected; overpayment rejected ("Amount must be between 0 and the balance"). Payment success shows no toast; previous error toast stays visible. UX.
- [IPD] Admit works (SUDIPTATES/IP/2026/00001); double admission rejected ("Patient is already admitted."). OK.
- [Appointments] Booked slot disappears from free list (no double-booking). Doctor on leave shows "No open hours set for this day" instead of "On leave – CME conference". Minor.
- [Appointments] Two separate places edit doctor hours (Doctor schedules page and Appointments → Doctor availability). Risk of confusion.
- [Appointments] "Add doctor" form here also takes a password — second user-creation path outside Users & Access.
- [Close-out] Lab: Ordered 6, Reported 3, Pending 4 (3+4≠6 — pending counts older orders while ordered counts today). Inconsistent.
- [Audit] Every action logged with user/time. Noise: "/api/me/favourites" UI clicks logged as admin_action.

## Created (admin)
- Schedule: QA Doctor Mon–Sat 09:00–13:00 + 17:00–20:00, 15-min slots
- Leave: Dr. Vikram Reddy 9–10 Nov 2026 "CME conference - Bengaluru"
- Services: VITD ₹1200, CRP ₹450, CT-HEAD ₹3500, PLASTER ₹800, AMB ₹1500
- Beds: Semi-Private SP1, SP2 (₹2000), ICU3 (₹6000) → 19 beds
- Medicines: Metformin 500mg, Amlodipine 5mg, ORS 21.8g sachet, Ondansetron 4mg
- GRN: MTF2611A ×300, AML2611A ×200, ORS2611A ×100, OND2611A ×150
- Patients (front desk, all test mobiles 90000001xx): Lakshmi Narayanan F52 →Dr Ananya CASH (000006); Ramesh Kulkarni M45 →Dr Rajesh UPI (000007); Fatima Sheikh F29 →Dr Vikram CARD (000008); Arjun Mehta M8 →QA Doctor Bill later (000009); Sunita Devi F67 →QA Doctor CASH (000010); Joseph Fernandes M38 →Dr Rajesh UPI (000011)
- Consultations: Ramesh Kulkarni (T2DM, Metformin, HbA1c/FBS/Lipid, f/u 1 Dec); Lakshmi Narayanan (empty – validation test); Fatima Sheikh (suspected dengue, Paracetamol+ORS, CBC/NS1/MP, f/u 3 days)
- Lab results entered: Ramesh HbA1c 8.4 %, FBS 168, Lipid TC 228…  (Fatima's CBC/NS1/MP left for Lab user)
- Pharmacy: dispensed Ramesh Metformin ×60 (₹180). Fatima's Rx left pending for Pharmacy user
- Invoice SUDIPTATES/INV/2026/000012 Ramesh ₹1,480 − ₹80 discount = ₹1,400; paid UPI ₹1,000 (UTR412345678901) + cash ₹400
- IPD: Lakshmi Narayanan admitted to Semi-Private SP1 under Dr. Ananya Sharma
- Appointments: Aarohi Deshpande → Dr. Ananya 2 Nov 10:00; Fatima Sheikh → Dr. Vikram 11 Nov 11:00
- Left for role tests: Arjun Mehta (QA Doctor, Bill later, unbilled), Sunita Devi (QA Doctor), Joseph Fernandes (Dr. Rajesh) still waiting in OPD
- Suppliers: Sri Lakshmi Pharma Distributors, MedPlus Wholesale (+ test record ZZ Invalid Contact Test)

## Page load (admin, warm cache) — all ready in 0.4–0.8 s
dashboard 525ms · frontdesk 514 · opd 419 · billing 420 · pharmacy 402 · laboratory 421 · ipd 515 · patients 419 · appointments 515 · schedules 561 · followups 418 · insurance 545 · checkin-qr 519 · closeout 719 · settings 828 · import 466 · audit 416 · profile 424
Slowest API: /api/me/favourites 642ms, /api/import 549ms, /api/auth/me 532ms, /api/pharmacy/stock 506ms. /api/subscription/status called on every page (~320–410ms).
/queue redirects to /opd. /documents and /day render nothing without parameters.
