# QA fixes + patient clearance (no dues) + IPD bed-day billing

## Why
An end-to-end QA run of every role (admin, reception, doctor, nurse, lab, pharmacy, billing) on greynova.in/hms found billing, safety and privacy bugs. Hospitals also asked for a "no dues" clearance before a patient leaves or is discharged.

## Fixes
**Money**
- Front desk charged every visit as "Emergency consultation" (₹1,000): `consultationFee` picked the most expensive consultation. The default is now the `OPD` service, else the cheapest regular consultation (never emergency/follow-up). A per-doctor fee can be set in Settings → Users.
- Billing "Total pending" ignored quantity (60 tablets showed ₹3). It now shows qty × rate.
- "Create invoice" bills pending charges first. Closing an untouched empty bill cancels it, so no ₹0 open invoices.

**Patient safety**
- Pharmacy: the stock item and quantity (dose × frequency × days) are pre-filled. Picking a different drug needs a "Substitute" tick, the server refuses an unconfirmed substitution (409), and substitutions are recorded in the audit log.
- The child dose check uses the weight typed on the open consultation, not only saved vitals.
- A consultation can't be finished empty (needs a diagnosis, complaint/examination or Rx).

**Security / privacy**
- All API responses send `Cache-Control: private, no-store` (they were `public`).
- Only admin can change the hospital payment-gateway keys or turn it on/off. Billing keeps a read-only view. Removed the encryption-config text from the gateway API.
- Reception, billing and lab no longer receive clinical notes from `GET /api/patients/{id}`.
- Lab report maker-checker: the uploader can't verify their own report when the lab has 2+ staff.

**Workflow**
- Offline front desk: the online attempt and its offline replay share one Idempotency-Key, so a request that reached the server isn't registered twice. The queue refreshes after a sync.
- When admin consults, orders and prescriptions record the treating doctor.
- "Close" returns an untouched token to Waiting. "Finish & next" stays in the same doctor's queue.
- Front desk asks before checking a patient in to an off-duty or offline doctor. Doctors without timings show "Available · no OPD timings set".
- Lab worklist shows an "Overdue" badge (stat 1 h, urgent 4 h, routine 24 h).
- Supplier phone and e-mail are validated.
- Page messages clear themselves after 6 s. The appointment booking message is clearer. Beds sort naturally (G1, G2 … G10). No more "Dr Dr" names.

## New: patient clearance (`/clearance`)
- Departments: OPD, Lab, Radiology, Pharmacy, Ward/IPD, Billing. Live checks per department. Departments the patient never used are "Not involved".
- Each department signs off with **Confirm clear**. With open items it must write a reason. **Hold** blocks with a reason. New work after a sign-off re-opens that department.
- Billing issues the clearance (`PREFIX/CLR/YYYY/NNNNNN`) only when every involved department has signed and nothing is unbilled or unpaid (all invoices). The slip is printable.
- "Waiting for me" worklist, "Confirm all ready" per department, a nudge banner on lab/pharmacy/doctor desk/IPD, the checklist inside Billing, and status in the discharge dialog.

## New: IPD bed-day billing
Each IST calendar day of a stay × the bed's daily rate is a pending charge, never billed twice (`admissions.bed_days_billed`). Migration 044 marks already-discharged or hand-billed admissions as billed, so old stays aren't charged again.

## Migrations
- `043_fees_clearance.sql`: `users.consultation_service_id`, `admissions.bed_days_billed`
- `044_clearance.sql`: `patient_clearances`, `clearance_signoffs`, back-fill of `bed_days_billed`

## Tests
`npm test`: 117/117 pass (new `tests/clearance.test.ts`: full clearance flow, fee rules, empty-consult block, wrong-drug guard, rx helpers). `next build` passes. Note: tests need Node 20+ (Node 18 has no global `crypto`).

## Not in this PR
- Light/Dark/System theme with the GreyNova brand colours
- Blocking discharge without clearance (currently a warning)
- GST lines on pharmacy items; nurse IPD tools (nursing notes, medicine administration record)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
