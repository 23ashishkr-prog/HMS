-- Staff duty roster: the weekly sessions and leave tables that drive doctor OPD now hold every staff member's shifts.
-- (Doctor booking only ever reads doctors' rows, so it is unchanged.) A shift whose end is at or before its start
-- runs overnight into the next day. Shift name (Morning/Evening/Night/...) and leave type are labels for the roster.
alter table doctor_availability add column if not exists shift_name text;
alter table doctor_time_off add column if not exists leave_type text not null default 'leave';
create index if not exists idx_time_off_hosp_span on doctor_time_off(hospital_id,start_at,end_at);
