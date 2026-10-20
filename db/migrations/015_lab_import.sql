-- Lab analyser / LIS import (HL7 v2 ORU^R01 or CSV). Results land as "pending verification"; lab staff verify before they reach the record.
alter table hospitals add column if not exists lab_api_key_hash text;
alter table hospitals add column if not exists lab_api_key_hint text;
create unique index if not exists idx_hospitals_lab_key on hospitals(lab_api_key_hash) where lab_api_key_hash is not null;
create table if not exists lab_result_imports(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,order_id uuid references diagnostic_orders(id) on delete set null,patient_id uuid references patients(id) on delete set null,source text not null,message_id text,uhid text,test_name text,observations jsonb not null default '[]',result_text text not null,status text not null default 'pending' check(status in ('pending','unmatched','verified','rejected')),reason text,verified_by uuid references users(id),verified_at timestamptz,created_at timestamptz not null default now());
create index if not exists idx_lab_imports on lab_result_imports(hospital_id,status,created_at);
create unique index if not exists idx_lab_imports_msg on lab_result_imports(hospital_id,message_id,coalesce(test_name,'')) where message_id is not null;
