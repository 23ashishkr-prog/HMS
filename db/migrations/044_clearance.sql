-- Patient clearance ("no dues"): every department involved in the patient's care confirms the patient is clear,
-- then billing issues the clearance (gate pass / discharge clearance) with its own number.
create table if not exists patient_clearances(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 patient_id uuid not null references patients(id) on delete cascade,
 admission_id uuid references admissions(id) on delete set null,
 status text not null default 'open' check(status in ('open','cleared','cancelled')),
 since timestamptz not null,
 note text,
 requested_by uuid references users(id) on delete set null,
 requested_at timestamptz not null default now(),
 clearance_no text,
 cleared_by uuid references users(id) on delete set null,
 cleared_at timestamptz,
 snapshot jsonb);
create unique index if not exists idx_clearance_open on patient_clearances(hospital_id,patient_id) where status='open';
create index if not exists idx_clearance_hospital on patient_clearances(hospital_id,status,requested_at desc);

-- One sign-off per department per clearance. status=cleared, or hold (department flags a problem with a note).
create table if not exists clearance_signoffs(
 id uuid primary key default gen_random_uuid(),
 clearance_id uuid not null references patient_clearances(id) on delete cascade,
 hospital_id uuid not null references hospitals(id) on delete cascade,
 department text not null check(department in ('opd','lab','radiology','pharmacy','ipd','billing')),
 status text not null check(status in ('cleared','hold')),
 note text,
 with_open_items boolean not null default false,
 signed_by uuid references users(id) on delete set null,
 signed_at timestamptz not null default now(),
 unique(clearance_id,department));

-- Bed-day billing starts with this release: admissions already discharged (or with a bed line on a bill) count as fully billed,
-- so nothing is charged twice for stays billed by hand before.
update admissions a set bed_days_billed=greatest(1,((coalesce(a.discharged_at,now()) at time zone 'Asia/Kolkata')::date-(a.admitted_at at time zone 'Asia/Kolkata')::date))
 where a.bed_days_billed=0 and (a.status='discharged' or exists(select 1 from invoices i join invoice_items it on it.invoice_id=i.id left join service_catalog s on s.id=it.service_id
  where i.patient_id=a.patient_id and i.hospital_id=a.hospital_id and i.status<>'cancelled' and (s.category='bed' or it.description ilike '%bed%')));
