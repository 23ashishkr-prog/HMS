-- Uploaded lab/radiology report files (PDF/images), stored in Postgres per hospital. No external blob store needed.
create table if not exists report_files(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 patient_id uuid not null references patients(id) on delete cascade,
 order_id uuid references diagnostic_orders(id) on delete set null,
 title text not null,
 file_name text not null,
 mime text not null,
 size_bytes int not null,
 data bytea not null,
 sha256 text not null,
 notes text,
 uploaded_by uuid references users(id) on delete set null,
 verified_by uuid references users(id) on delete set null,
 verified_at timestamptz,
 created_at timestamptz not null default now());
create index if not exists idx_report_files_patient on report_files(hospital_id,patient_id,created_at desc);
create index if not exists idx_report_files_order on report_files(hospital_id,order_id);
