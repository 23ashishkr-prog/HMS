# UI research: what top-rated HMS/EHR products do, and what we adopted

Research date: October 2026. The goal was a modern, calm, fast UI that clinicians and front-office staff in Indian hospitals pick up quickly, on desktop, tablet and phone.

## Sources

| Product / source | Rating / recognition | What we looked at |
|---|---|---|
| **Epic** (EpicCare Ambulatory) | 2026 Best in KLAS: Overall Health System Suite (16th year) and 11 segments | Persistent patient header ("storyboard"), chart review tabs, in-basket style worklists |
| **athenahealth athenaOne** | 2026 Best in KLAS: Overall Independent Physician Practice Suite; #1 Ambulatory EHR (11–75 and >75 physicians) | Clean task-first workflows, embedded scheduling → billing, AI-native assist |
| **Elation Health** | 2026 Best in KLAS: Small Practice Ambulatory EHR/PM; "logical, easy to read timeline view" in reviews | Three-column chart; always-visible Clinical Profile (allergies, problems, meds); **Chronological Record** newest-first with "requiring action" on top; AI chart summary |
| **Tebra (Kareo + PatientPop)** | G2 4.1/5 (263 reviews), Capterra ease of use 4.1/5 | Reviewers praise "user-friendly", "see past notes"; complain about "excessive clicking within each tab", lack of filtering → we keep records on one page with filters |
| **Practo Ray / Insta** (India) | Capterra 4.0 (Ray) / 3.6 (Insta, ease of use 3.5) | Indian clinic flows (token, UHID, cash/UPI); reviews ask for simpler, more intuitive modules and mobile access |
| **NHS Digital** (CUI patient banner; NHS service manual) | Public standard / guidance | Consistent patient banner for right-patient verification; WCAG 2.2 AA, visible focus, landmarks, no overlay widgets; "Usability is a clinical safety issue" |
| Dribbble/Behance healthcare dashboards (2024–26 "medical dashboard" collections) | Community-curated | Flat tinted icon tiles, hairline cards, large tabular numerals, generous whitespace |

Links:
- KLAS 2026 Best in KLAS report: https://klasresearch.com/report/2026-best-in-klas-awards-software-and-services/3906
- KLAS press release (Epic, athenahealth overall winners): https://engage.klasresearch.com/press-release/epic-athenahealth-chartis-optimum-healthcare-it-and-impact-advisors-win-2026-overall-best-in-klasawards/
- Becker's: KLAS functionality scores (Epic 7.5, athenahealth 7.1): https://www.beckersasc.com/leadership/best-ambulatory-ehrs-by-functionality-klas/
- Elation patient chart: https://help.elationhealth.com/articles/Patient-Chart-Introduction
- Elation chronological record: https://elation.my.site.com/helpcenter/s/article/store-everything-in-chronological-record
- Elation reviews (timeline praised): https://www.softwareadvice.com/medical/elation-emr-profile/reviews/
- Tebra on G2: https://ai.g2.com/product/tebra-previously-kareo-patientpop
- Practo Ray on Capterra: https://www.capterra.com/p/167778/Ray/ ; Insta: https://www.capterra.com/p/130501/Insta-HMS/
- NHS CUI patient banner background: https://digital.nhs.uk/blog/transformation-blog/2019/why-we-are-withdrawing-the-nhs-common-user-interface
- NHS service manual, accessibility in design: https://service-manual.nhs.uk/accessibility/design

## Patterns adopted

1. **Patient banner everywhere a patient is open** (Epic storyboard, NHS banner): name, UHID, age, sex, blood group, phone, ABHA, with **allergies in a coral pill** that you cannot miss. Used on the Doctor desk consultation pad and the full Patient record.
2. **Chronological timeline** (Elation): visits, prescriptions, results, uploaded reports, IPD and bills merged newest-first with type filters. AI history summary card sits on the Overview (like Elation AI) and is labelled as AI-assisted.
3. **One-page record with tabs, not deep menus** (Tebra complaints about clicking): Overview · Timeline · Visits · Vitals · Prescriptions · Labs & reports (inline PDF/image viewer) · IPD · Bills.
4. **Calm, flat surfaces**: white cards with hairline borders and a 1px shadow on a soft grey page, replacing the heavy glass, blur and 3D icons. Flat tinted icon tiles take the accent colour (coral for money/medicine/compliance).
5. **Type and spacing scale**: Poppins headings (26/18/16), Open Sans body (15), tabular numerals for money and vitals, 8-pt spacing, 28–32px page gutters on desktop.
6. **Tables**: sticky light header, 13px uppercase column labels, roomy rows and hover. On phones they become stacked label/value cards.
7. **Status is never colour-only**: dots carry a text label too (Available / On leave / Offline, verified / unverified) (WCAG, NHS).
8. **Responsive shell**: phone top bar + bottom tabs + "All modules" sheet; tablet icon rail/drawer; desktop navy sidebar. Single-module roles get no bottom bar, and keyboard hints are hidden on touch devices.
9. **Personal appearance**: light (default), soft grey and dark themes, accent presets, density and text size. Saved per user, with a hospital default set by the admin.
