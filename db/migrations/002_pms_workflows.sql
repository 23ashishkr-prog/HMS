-- 002: PMS workflows (registration/ABHA, token queue, OPD EMR, orders, billing, IPD, TPA, audit).
-- Idempotent: safe to run on databases that already have 001.

-- Patient registration (UHID + ABHA / ABDM fields)
alter table patients add column if not exists abha_number text;
alter table patients add column if not exists abha_address text;
alter table patients add column if not exists email text;
alter table patients add column if not exists city text;
alter table patients add column if not exists state text;
alter table patients add column if not exists pincode text;
alter table patients add column if not exists id_proof_type text;
alter table patients add column if not exists id_proof_number text;
alter table patients add column if not exists emergency_contact_name text;
alter table patients add column if not exists emergency_contact_phone text;
alter table patients add column if not exists allergies text;
alter table patients add column if not exists registered_by uuid references users(id);
create unique index if not exists idx_patients_abha on patients(hospital_id,abha_number) where abha_number is not null;
create index if not exists idx_patients_mobile on patients(hospital_id,mobile);

create table if not exists hospital_counters(hospital_id uuid not null references hospitals(id) on delete cascade,name text not null,period text not null default '',last_value int not null default 0,primary key(hospital_id,name,period));

-- Queue / token
alter table doctor_queue add column if not exists token_no int;
alter table doctor_queue add column if not exists visit_date date not null default current_date;
alter table doctor_queue add column if not exists appointment_id uuid references appointments(id) on delete set null;
alter table doctor_queue add column if not exists completed_at timestamptz;
create unique index if not exists idx_queue_token on doctor_queue(hospital_id,doctor_user_id,visit_date,token_no) where token_no is not null;

-- OPD consultation / EMR
create table if not exists encounters(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,doctor_user_id uuid not null references users(id),queue_id uuid references doctor_queue(id) on delete set null,encounter_type text not null default 'OPD' check(encounter_type in ('OPD','IPD','ER')),chief_complaint text,history text,examination text,advice text,follow_up_date date,status text not null default 'open' check(status in ('open','closed')),created_at timestamptz not null default now(),closed_at timestamptz);
create index if not exists idx_encounters_patient on encounters(patient_id,created_at desc);
create table if not exists vitals(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,encounter_id uuid references encounters(id) on delete cascade,temperature_c numeric(4,1),pulse int,bp_systolic int,bp_diastolic int,resp_rate int,spo2 int,weight_kg numeric(5,1),height_cm numeric(5,1),recorded_by uuid not null references users(id),recorded_at timestamptz not null default now());
create index if not exists idx_vitals_patient on vitals(patient_id,recorded_at desc);
create table if not exists diagnoses(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,encounter_id uuid not null references encounters(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,icd10_code text,description text not null,diagnosis_type text not null default 'provisional' check(diagnosis_type in ('provisional','final')),created_at timestamptz not null default now());
alter table prescriptions add column if not exists encounter_id uuid references encounters(id) on delete set null;
alter table prescriptions add column if not exists dispensed_by uuid references users(id);

-- Service / test catalogue (master data entered by admin; nothing seeded)
create table if not exists service_catalog(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,code text not null,name text not null,category text not null check(category in ('consultation','lab','radiology','procedure','bed','pharmacy','other')),price numeric(12,2) not null default 0 check(price>=0),active boolean not null default true,created_at timestamptz not null default now(),unique(hospital_id,code));

-- Lab & radiology orders
create table if not exists diagnostic_orders(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,encounter_id uuid references encounters(id) on delete set null,service_id uuid references service_catalog(id),test_name text not null,category text not null check(category in ('lab','radiology')),priority text not null default 'routine' check(priority in ('routine','urgent','stat')),status text not null default 'ordered' check(status in ('ordered','sample_collected','completed','cancelled')),clinical_notes text,ordered_by uuid not null references users(id),ordered_at timestamptz not null default now(),sample_collected_at timestamptz,result_text text,result_file_url text,resulted_by uuid references users(id),resulted_at timestamptz);
create index if not exists idx_orders_status on diagnostic_orders(hospital_id,category,status,ordered_at);

-- Pharmacy inventory
create table if not exists medicines(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,name text not null,strength text,form text,unit_price numeric(12,2) not null default 0,reorder_level int not null default 0,active boolean not null default true,created_at timestamptz not null default now(),unique(hospital_id,name,strength,form));
create table if not exists medicine_batches(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,medicine_id uuid not null references medicines(id) on delete cascade,batch_no text not null,expiry_date date not null,quantity int not null check(quantity>=0),received_by uuid not null references users(id),received_at timestamptz not null default now());

-- Billing
create table if not exists invoices(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,invoice_no text not null,admission_id uuid,status text not null default 'open' check(status in ('open','partially_paid','paid','cancelled')),discount numeric(12,2) not null default 0,created_by uuid not null references users(id),created_at timestamptz not null default now(),unique(hospital_id,invoice_no));
create table if not exists invoice_items(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references invoices(id) on delete cascade,service_id uuid references service_catalog(id),description text not null,quantity numeric(10,2) not null default 1 check(quantity>0),unit_price numeric(12,2) not null check(unit_price>=0),created_at timestamptz not null default now());
create table if not exists payments(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,invoice_id uuid not null references invoices(id) on delete cascade,amount numeric(12,2) not null check(amount>0),mode text not null check(mode in ('cash','upi','card','netbanking','insurance','other')),reference text,received_by uuid not null references users(id),received_at timestamptz not null default now());

-- IPD
create table if not exists beds(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,ward text not null,bed_no text not null,bed_type text not null default 'general',daily_rate numeric(12,2) not null default 0,active boolean not null default true,unique(hospital_id,ward,bed_no));
create table if not exists admissions(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,bed_id uuid not null references beds(id),admitting_doctor_id uuid not null references users(id),admission_no text not null,reason text,status text not null default 'admitted' check(status in ('admitted','discharged')),admitted_at timestamptz not null default now(),discharged_at timestamptz,discharge_summary text,discharge_diagnosis text,discharge_advice text,created_by uuid not null references users(id),unique(hospital_id,admission_no));
create unique index if not exists idx_bed_occupied on admissions(bed_id) where status='admitted';
create unique index if not exists idx_patient_admitted on admissions(patient_id) where status='admitted';

-- Insurance / TPA
create table if not exists insurance_claims(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,admission_id uuid references admissions(id) on delete set null,invoice_id uuid references invoices(id) on delete set null,payer_name text not null,tpa_name text,policy_number text not null,scheme text,claimed_amount numeric(12,2) not null default 0,approved_amount numeric(12,2),status text not null default 'preauth_requested' check(status in ('preauth_requested','preauth_approved','claim_submitted','settled','rejected')),remarks text,created_by uuid not null references users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());

-- Audit log
create table if not exists audit_log(id bigserial primary key,hospital_id uuid not null references hospitals(id) on delete cascade,user_id uuid references users(id),action text not null,entity text not null,entity_id text,details jsonb,created_at timestamptz not null default now());
create index if not exists idx_audit_hospital on audit_log(hospital_id,created_at desc);
