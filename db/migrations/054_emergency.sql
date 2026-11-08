-- Emergency department: ER visits with colour triage (5-level, matched to ESI), re-triage history, door-to-doctor time,
-- disposition (admit links the IPD admission), and the medico-legal case (MLC) register with police intimation.
create table if not exists er_visits(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 visit_no text not null,
 patient_id uuid not null references patients(id),
 unknown_patient boolean not null default false, temp_name text, approx_age int, gender text,
 arrival_mode text not null default 'walk_in' check(arrival_mode in ('walk_in','ambulance_108','private_ambulance','police','referred','other')),
 arrived_at timestamptz not null default now(), brought_by text, referred_from text,
 chief_complaint text,
 triage_level text check(triage_level in ('red','orange','yellow','green','black')),
 triage_vitals jsonb, triaged_at timestamptz, triaged_by uuid references users(id) on delete set null, first_triaged_at timestamptz,
 doctor_id uuid references users(id) on delete set null, doctor_seen_at timestamptz,
 is_mlc boolean not null default false,
 disposition text check(disposition in ('admitted','discharged','referred','lama','absconded','death')),
 disposition_at timestamptz, disposition_by uuid references users(id) on delete set null, disposition_note text, referred_to text,
 admission_id uuid references admissions(id) on delete set null,
 created_by uuid references users(id) on delete set null, created_at timestamptz not null default now(),
 unique(hospital_id,visit_no));
create index if not exists idx_er_open on er_visits(hospital_id,arrived_at) where disposition is null;
create index if not exists idx_er_patient on er_visits(patient_id);
create table if not exists er_triages(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 visit_id uuid not null references er_visits(id) on delete cascade,
 level text not null check(level in ('red','orange','yellow','green','black')),
 vitals jsonb not null default '{}'::jsonb, note text,
 triaged_by uuid references users(id) on delete set null, triaged_at timestamptz not null default now());
create index if not exists idx_er_triages on er_triages(visit_id,triaged_at);
create table if not exists mlc_cases(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 er_visit_id uuid not null unique references er_visits(id),
 patient_id uuid not null references patients(id),
 mlc_no text not null, mlc_year int not null,
 mlc_type text not null check(mlc_type in ('rta','assault','burns','poisoning','fall','hanging','snake_bite','sexual_assault','other')),
 type_detail text, incident_at timestamptz, incident_place text,
 police_station text, intimation_sent_at timestamptz, intimation_sent_by uuid references users(id) on delete set null,
 officer_name text, officer_buckle_no text,
 brought_by text, identification_marks text,
 injuries jsonb not null default '[]'::jsonb, notes text,
 status text not null default 'open' check(status in ('open','closed')), closed_at timestamptz, closed_by uuid references users(id) on delete set null,
 created_by uuid references users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(hospital_id,mlc_no));
create index if not exists idx_mlc_list on mlc_cases(hospital_id,created_at desc);
-- Every change to an MLC after it is opened: who, when, why, and each field's old and new value.
create table if not exists mlc_amendments(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 mlc_id uuid not null references mlc_cases(id) on delete cascade,
 changes jsonb not null, reason text,
 changed_by uuid references users(id) on delete set null, changed_at timestamptz not null default now());
create index if not exists idx_mlc_amend on mlc_amendments(mlc_id,changed_at);
-- MLC records are legal documents: they can never be deleted (only when the whole hospital account is purged).
create or replace function mlc_no_delete() returns trigger language plpgsql as $$
begin
 if exists(select 1 from hospitals where id=old.hospital_id) then raise exception 'MLC records cannot be deleted; amend them instead.'; end if;
 return old;
end $$;
drop trigger if exists trg_mlc_no_delete on mlc_cases;
create trigger trg_mlc_no_delete before delete on mlc_cases for each row execute function mlc_no_delete();
drop trigger if exists trg_mlc_amend_no_delete on mlc_amendments;
create trigger trg_mlc_amend_no_delete before delete on mlc_amendments for each row execute function mlc_no_delete();
