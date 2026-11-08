-- Radiology workflow on top of diagnostic_orders (category='radiology'): one study per order.
-- scheduled → acquired → reported → verified. On verify the order is completed and result_text carries the impression,
-- so the report reaches the patient record, portal and discharge summary the same way lab results do.
create table if not exists radiology_studies(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,order_id uuid not null unique references diagnostic_orders(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,
 modality text not null check(modality in ('xray','ct','mri','usg','mammo','fluoro','dexa','cardio')),body_part text,scheduled_at timestamptz,room text,
 contrast boolean not null default false,contrast_agent text,allergy_status text not null default 'unknown' check(allergy_status in ('unknown','none','known')),allergy_note text,creatinine numeric(5,2),pregnancy_status text not null default 'unknown' check(pregnancy_status in ('na','not_pregnant','pregnant','unknown')),safety_checked_by uuid references users(id),safety_checked_at timestamptz,safety_override text,
 accession_no text not null,study_instance_uid text,status text not null default 'scheduled' check(status in ('scheduled','acquired','reported','verified')),
 technician_id uuid references users(id),acquired_at timestamptz,radiologist_id uuid references users(id),reported_at timestamptz,verified_by uuid references users(id),verified_at timestamptz,
 technique text,findings text,impression text,critical boolean not null default false,critical_notified_at timestamptz,critical_ack_by uuid references users(id),critical_ack_at timestamptz,
 created_by uuid references users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(hospital_id,accession_no));
create unique index if not exists uq_radiology_study_uid on radiology_studies(hospital_id,study_instance_uid) where study_instance_uid is not null;
create index if not exists idx_radiology_worklist on radiology_studies(hospital_id,status,modality,scheduled_at);
-- PACS viewer link (OHIF / Orthanc style). Placeholders: {studyUid} {accession} {uhid}.
alter table hospitals add column if not exists pacs_viewer_url text;
alter table hospitals add column if not exists pacs_dicomweb_url text;
