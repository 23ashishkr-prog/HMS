-- Multiple OPD sessions per weekday (e.g. 09:00-13:00 and 17:00-20:00) + doctor online/available toggle.
alter table doctor_availability drop constraint if exists doctor_availability_doctor_user_id_day_of_week_key;
create unique index if not exists uq_doctor_session on doctor_availability(doctor_user_id,day_of_week,start_time);
create index if not exists idx_doctor_avail_hosp on doctor_availability(hospital_id,doctor_user_id);
create index if not exists idx_doctor_timeoff on doctor_time_off(hospital_id,doctor_user_id,end_at);
alter table users add column if not exists online boolean not null default true;
alter table users add column if not exists online_changed_at timestamptz;
