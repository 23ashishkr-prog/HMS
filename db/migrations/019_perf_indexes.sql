-- Performance: indexes for the hottest tenant-scoped reads (measured in PERF.md)
create index if not exists idx_queue_hosp_day on doctor_queue(hospital_id,visit_date,doctor_user_id,token_no);
create index if not exists idx_queue_patient_day on doctor_queue(hospital_id,patient_id,visit_date);
create index if not exists idx_patients_hosp_created on patients(hospital_id,created_at desc);
create index if not exists idx_invoices_hosp_created on invoices(hospital_id,created_at desc);
create index if not exists idx_payments_hosp_received on payments(hospital_id,received_at);
create index if not exists idx_prescriptions_hosp_status on prescriptions(hospital_id,status,created_at desc);
create index if not exists idx_users_hosp_role on users(hospital_id,role) where active;
create index if not exists idx_appointments_hosp_time on appointments(hospital_id,scheduled_at);
-- Trigram search for patient name/UHID/mobile "contains" lookups. Optional: skipped if pg_trgm is unavailable.
do $$ begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists idx_patients_name_trgm on patients using gin (full_name gin_trgm_ops)';
  execute 'create index if not exists idx_patients_uhid_trgm on patients using gin (uhid gin_trgm_ops)';
  execute 'create index if not exists idx_patients_mobile_trgm on patients using gin (mobile gin_trgm_ops)';
exception when others then raise notice 'pg_trgm not available: %', sqlerrm;
end $$;
