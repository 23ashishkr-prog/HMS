-- 056: PM-JAY (Ayushman Bharat) package billing, pre-authorisation, scheme claims and NHCX message log.
-- Package billing is cashless: on a package-mode bill every itemised line keeps its price in record_price and is billed at Rs 0;
-- the package amount is billed to the scheme through the claim. Triggers keep later lines (bed days, orders, medicines) at Rs 0 too,
-- so every existing balance calculation shows Rs 0 due without special cases.

-- HBP package master (per hospital, imported from the NHA CSV)
create table if not exists hbp_packages(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,code text not null,specialty text,name text not null,rate numeric(12,2) not null default 0 check(rate>=0),pre_auth_required boolean not null default true,implant_allowed boolean not null default false,los_days int,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(hospital_id,code));
create index if not exists idx_hbp_packages_search on hbp_packages(hospital_id,specialty);

-- Scheme / beneficiary on the patient (default for next time) and on the admission (what this stay is billed under)
alter table patients add column if not exists scheme text;
alter table patients add column if not exists scheme_member_id text;
alter table patients add column if not exists scheme_payer text;
alter table patients add column if not exists scheme_verification text not null default 'unverified';
alter table patients add column if not exists scheme_verified_at timestamptz;
alter table admissions add column if not exists scheme text;
alter table admissions add column if not exists scheme_member_id text;
alter table admissions add column if not exists scheme_payer text;
alter table admissions add column if not exists scheme_verification text not null default 'unverified';
alter table admissions add column if not exists package_billing boolean not null default false;
alter table admissions add column if not exists packages jsonb not null default '[]';
alter table admissions add column if not exists package_amount numeric(12,2);
alter table admissions drop constraint if exists admissions_scheme_check;
alter table admissions add constraint admissions_scheme_check check(scheme is null or scheme in ('PMJAY','STATE','CGHS','ECHS','PRIVATE'));
alter table admissions drop constraint if exists admissions_scheme_verification_check;
alter table admissions add constraint admissions_scheme_verification_check check(scheme_verification in ('unverified','verified','failed'));
alter table patients drop constraint if exists patients_scheme_verification_check;
alter table patients add constraint patients_scheme_verification_check check(scheme_verification in ('unverified','verified','failed'));

-- Package-mode bills
alter table invoices add column if not exists package_mode boolean not null default false;
alter table invoice_items add column if not exists record_price numeric(12,2);
alter table invoice_items add column if not exists package_line boolean not null default false;

create or replace function hms_package_invoice() returns trigger language plpgsql as $$
declare a record;
begin
  if not new.package_mode then
    select id into a from admissions where hospital_id=new.hospital_id and patient_id=new.patient_id and status='admitted' and package_billing limit 1;
    if found then new.package_mode:=true; new.admission_id:=coalesce(new.admission_id,a.id); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_package_invoice on invoices;
create trigger trg_package_invoice before insert on invoices for each row execute function hms_package_invoice();

create or replace function hms_package_item() returns trigger language plpgsql as $$
begin
  if exists(select 1 from invoices where id=new.invoice_id and package_mode) and new.unit_price>0 then
    new.record_price:=coalesce(new.record_price,new.unit_price); new.unit_price:=0;
  end if;
  return new;
end $$;
drop trigger if exists trg_package_item on invoice_items;
create trigger trg_package_item before insert on invoice_items for each row execute function hms_package_item();

-- Pre-authorisation requests (initial + enhancements) with an event trail
create table if not exists preauth_requests(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,admission_id uuid references admissions(id) on delete set null,
  kind text not null default 'initial' check(kind in ('initial','enhancement')),parent_id uuid references preauth_requests(id) on delete set null,
  scheme text not null default 'PMJAY',payer_name text,member_id text,packages jsonb not null default '[]',diagnosis text,clinical_notes text,documents jsonb not null default '[]',
  requested_amount numeric(12,2) not null default 0,approved_amount numeric(12,2),payer_ref text,
  status text not null default 'draft' check(status in ('draft','submitted','queried','approved','rejected')),query_text text,query_reply text,decision_note text,
  submitted_at timestamptz,decided_at timestamptz,created_by uuid not null references users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists idx_preauth_hosp on preauth_requests(hospital_id,status,updated_at desc);
create table if not exists preauth_events(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,preauth_id uuid not null references preauth_requests(id) on delete cascade,from_status text,to_status text not null,note text,amount numeric(12,2),by_user uuid references users(id),at timestamptz not null default now());
create index if not exists idx_preauth_events on preauth_events(preauth_id,at);

-- Scheme claims ride on insurance_claims (reuses the claim packet + document checklist)
alter table insurance_claims add column if not exists preauth_id uuid references preauth_requests(id) on delete set null;
alter table insurance_claims add column if not exists submitted_at timestamptz;
alter table insurance_claims add column if not exists settled_at timestamptz;
alter table insurance_claims add column if not exists settlement_ref text;
alter table insurance_claims add column if not exists deduction_amount numeric(12,2);
alter table insurance_claims add column if not exists deduction_reason text;

-- NHCX request/response log (offline/sandbox bundles are stored here for download)
create table if not exists nhcx_messages(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid references patients(id) on delete cascade,
  entity text not null check(entity in ('eligibility','preauth','claim')),entity_id uuid,action text not null,mode text not null check(mode in ('offline','live')),
  correlation_id text not null,api_call_id text not null,workflow_id text,recipient_code text,request jsonb not null,response jsonb,
  status text not null default 'generated' check(status in ('generated','sent','acknowledged','failed','response_received')),error text,created_by uuid references users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists idx_nhcx_hosp on nhcx_messages(hospital_id,created_at desc);
create index if not exists idx_nhcx_corr on nhcx_messages(correlation_id);

-- Hospital's NHCX participant settings (secrets AES-GCM encrypted with INTEGRATIONS_ENC_KEY)
create table if not exists nhcx_settings(hospital_id uuid primary key references hospitals(id) on delete cascade,participant_code text,username text,gateway_url text,default_payer_code text,secrets text,updated_by uuid references users(id),updated_at timestamptz not null default now());
