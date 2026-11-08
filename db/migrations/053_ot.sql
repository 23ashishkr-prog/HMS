-- Operation theatre: OT rooms, scheduled surgeries with the team, the operative note and the WHO Surgical Safety Checklist
-- (sign in before anaesthesia, time out before incision, sign out before the patient leaves the theatre).
create table if not exists ot_rooms(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 name text not null, active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(hospital_id,name));
create table if not exists surgeries(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 patient_id uuid not null references patients(id) on delete cascade,
 admission_id uuid references admissions(id) on delete set null,
 room_id uuid not null references ot_rooms(id),
 surgeon_id uuid not null references users(id),
 assistant_ids uuid[] not null default '{}',
 anaesthetist_id uuid references users(id),
 procedure_name text not null,
 service_id uuid references service_catalog(id) on delete set null,
 scheduled_start timestamptz not null, scheduled_end timestamptz not null check(scheduled_end>scheduled_start),
 anaesthesia_type text check(anaesthesia_type in ('general','spinal','epidural','regional','local','sedation','none')),
 priority text not null default 'elective' check(priority in ('elective','emergency')),
 status text not null default 'scheduled' check(status in ('scheduled','in_progress','completed','cancelled')),
 remarks text,
 actual_start timestamptz, actual_end timestamptz,
 cancelled_at timestamptz, cancel_reason text,
 -- Operative note
 pre_op_diagnosis text, post_op_diagnosis text, findings text, procedure_details text,
 implants jsonb not null default '[]'::jsonb, blood_loss_ml int check(blood_loss_ml>=0), complications text, post_op_instructions text,
 note_by uuid references users(id) on delete set null, note_at timestamptz,
 -- WHO Surgical Safety Checklist: answers per phase; by/at are set when the phase is complete
 sign_in jsonb not null default '{}'::jsonb, sign_in_by uuid references users(id) on delete set null, sign_in_at timestamptz,
 time_out jsonb not null default '{}'::jsonb, time_out_by uuid references users(id) on delete set null, time_out_at timestamptz,
 sign_out jsonb not null default '{}'::jsonb, sign_out_by uuid references users(id) on delete set null, sign_out_at timestamptz,
 created_by uuid references users(id) on delete set null, created_at timestamptz not null default now());
create index if not exists idx_surg_room on surgeries(hospital_id,room_id,scheduled_start);
create index if not exists idx_surg_surgeon on surgeries(hospital_id,surgeon_id,scheduled_start);
create index if not exists idx_surg_patient on surgeries(hospital_id,patient_id,status);
