alter table hospitals add column if not exists public_booking_enabled boolean not null default false;
alter table appointments add column if not exists mode text not null default 'in_person';
alter table appointments add column if not exists meet_url text;
alter table appointments add column if not exists meet_event_id text;
alter table appointments add column if not exists source text;
alter table appointments add column if not exists notes text;
alter table patients add column if not exists provisional boolean not null default false;
create index if not exists idx_appt_public on appointments(hospital_id,source,created_at);
