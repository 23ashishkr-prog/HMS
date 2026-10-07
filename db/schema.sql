create extension if not exists pgcrypto;
do $$ begin create type hms_role as enum ('admin','reception','doctor','lab','pharmacy','patient'); exception when duplicate_object then null; end $$;
create table if not exists hospitals(id uuid primary key default gen_random_uuid(),name text not null,code text not null unique,created_at timestamptz not null default now());
create table if not exists users(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 email text not null,
 full_name text not null,
 role hms_role not null,
 password_hash text not null,
 active boolean not null default true,
 must_change_password boolean not null default true,
 last_login_at timestamptz,
 password_changed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(hospital_id,email)
);
create index if not exists idx_users_email on users(lower(email));
create table if not exists patients(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,uhid text not null,full_name text not null,mobile text,created_at timestamptz not null default now(),unique(hospital_id,uhid));
create table if not exists patient_assignments(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,doctor_user_id uuid not null references users(id),active boolean not null default true,created_at timestamptz not null default now());
create index if not exists idx_patients_uhid on patients(uhid);
create index if not exists idx_assignments_doctor on patient_assignments(doctor_user_id,active);
