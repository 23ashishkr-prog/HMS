-- Structured discharge summary, and the record of an admin override when a patient leaves before clearance.
alter table admissions add column if not exists discharge_type text not null default 'normal';
alter table admissions add column if not exists discharge_condition text;
alter table admissions add column if not exists discharge_treatment text;
alter table admissions add column if not exists discharge_medications jsonb not null default '[]'::jsonb;
alter table admissions add column if not exists follow_up_date date;
alter table admissions add column if not exists clearance_no text;
alter table admissions add column if not exists discharge_override text;
