create table if not exists patient_otps(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,mobile text not null,code_hash text not null,channel text not null,expires_at timestamptz not null,attempts int not null default 0,used_at timestamptz,ip text,created_at timestamptz not null default now());
create index if not exists idx_patient_otps on patient_otps(hospital_id,mobile,created_at desc);
alter table medicine_adherence add column if not exists dose_key text;
alter table medicine_adherence add column if not exists prescription_id uuid;
create unique index if not exists uq_adherence_dose on medicine_adherence(patient_id,dose_key) where dose_key is not null;
