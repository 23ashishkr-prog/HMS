# UX benchmark: how leading HMS products lay out daily work

Sources: the public Insta by Practo product pages (Patient Administration, Revenue Cycle), Bahmni clinical docs and its public e2e specs (`bahmni-e2e-tests/LabAndBilling.spec`), KareXpert product pages, and publicly documented Epic front-desk and in-basket patterns. These notes describe workflows only. No proprietary UI or code is copied.

## What they put front and centre
| Product | Home screens per role | Patterns we adopted |
|---|---|---|
| Insta (Practo) | **Single OP registration screen** with demographics, sponsor, visit and order details together. Tokens are auto-assigned per consultant. Registration autocompletes on MR no, name or mobile. Payment is taken on the same screen. Billing places orders from pending prescriptions. | Front desk = one screen: type a name or mobile → pick the match or register inline → doctor → fee → token. Billing pulls pending charges automatically. |
| Bahmni | Registration → Start OPD visit → **Clinical consultation pad** (observations/vitals, diagnosis, medications, orders on tabs) → visit dashboard. Lab collects the sample then enters results. Billing turns orders into a quotation and a sale. | Doctor desk = queue on the left, the whole consultation on one page on the right (no tabs). Lab = worklist with an inline result. Orders feed billing. |
| KareXpert | Doctor portal: appointments/queue → e-prescription with treatment plan, labs and dosage. Admin sets fees and payment options. | Rx table with sensible defaults (1-0-1, 5 days, after food), test chips, follow-up quick picks. |
| Epic-style | Role-based activity tabs. Patient lookup everywhere (header search). Keyboard-first entry. "Sign & close" moves to the next patient. | Global header search (`/`, Ctrl K), Alt+1..7 to switch desks, Ctrl+Enter submits, "Finish & next patient". |

## Design rules applied
1. **Each role lands on its own desk**: reception → Front desk, doctor/nurse → Doctor desk, billing → Billing, lab → Lab worklist, pharmacy → Pharmacy, admin → Dashboard.
2. **Seven primary modules** (Dashboard, Front desk, Doctor desk, Billing, Pharmacy, Lab, IPD beds). Patients, Appointments, Insurance/TPA, Settings and Audit live under **More**. The platform console stays at a separate URL (`/platform`).
3. **Inline forms instead of extra pages.** Optional fields (ABHA, address, allergies) sit behind "+ ABHA, address…".
4. **Remembered defaults**: last doctor used, fee mode Cash, Rx frequency and duration.
5. **Toasts** confirm every action. Errors from the API are shown verbatim.
6. **Large readable tables**, status colour chips (waiting/consultation/checked), and original 3D-style glossy SVG icons (`components/Icon3D.tsx`, authored for this repo, so no licensing issues).

## Click counts for key flows (before → after)
Counted as clicks/keystroke-submits after the data is typed.
| Flow | Before (v1) | After (v2) |
|---|---|---|
| New walk-in: register + token + collect fee | Not possible end-to-end. Patients page: open form (1), register (1), open 360 (1), choose doctor (1), check in (1), Billing: find (2), create (1), add item (2), pay (1) = **11** | Type name/mobile, then **1** click (Ctrl+Enter). The doctor and Cash defaults are already selected. |
| Returning patient visit | search (1) + open 360 (1) + doctor (1) + check in (1) + billing ~6 = **10** | Type → pick match (1) → submit (1) = **2** |
| Doctor consultation with vitals, Dx, 1 drug, 1 test | Open (1) + vitals save (1) + diagnosis add (1) + Rx save (1) + order (1) + close (1) + reopen next (1) = **7** in a scrolling drawer | Click token (1) → fill → test chip (1) → Finish & next (1) = **3**, and the next patient opens automatically |
| Bill a patient's orders and collect | create invoice (2) + add each item (2/item) + payment form (2) = **6+** | Search (Enter) → Bill all (1) → Collect·UPI (1) = **3** |
| Lab result entry | collect (1) + result via two prompt dialogs (3) = **4** | collect (1) → type result → Enter = **2** |
