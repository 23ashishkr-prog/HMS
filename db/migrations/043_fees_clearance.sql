-- Per-doctor consultation fee: the front desk and billing charge this service for the doctor's visits.
-- Null = hospital default (the "OPD" service, else the cheapest regular consultation; never Emergency/Follow-up).
alter table users add column if not exists consultation_service_id uuid references service_catalog(id) on delete set null;

-- IPD bed-day billing: how many bed-days of the admission are already on an invoice.
alter table admissions add column if not exists bed_days_billed integer not null default 0;

