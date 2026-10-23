-- 037: hospital-admin support tickets (stored on incidents with source=admin_ticket) + optional ticket fields.
alter table incidents add column if not exists title text;
alter table incidents add column if not exists severity text;
alter table incidents add column if not exists category text;
alter table incidents add column if not exists created_by uuid references users(id) on delete set null;
alter table incidents drop constraint if exists incidents_severity_check;
alter table incidents add constraint incidents_severity_check check (severity is null or severity in ('low','medium','high','critical'));
create index if not exists idx_incidents_hospital_source on incidents(hospital_id, source, last_seen desc);
