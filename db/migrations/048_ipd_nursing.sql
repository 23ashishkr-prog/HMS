-- Inpatient nursing: medicine orders with a medication administration record (eMAR), bedside charts
-- (vitals, intake, output) and notes (nursing notes and doctor rounds). All per admission.
create table if not exists ipd_med_orders(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 admission_id uuid not null references admissions(id) on delete cascade,
 medicine_name text not null, dose text, route text, frequency text not null, times text[] not null default '{}',
 instructions text, starts_on date not null, ends_on date,
 status text not null default 'active' check(status in ('active','stopped')),
 ordered_by uuid references users(id) on delete set null, ordered_at timestamptz not null default now(),
 stopped_by uuid references users(id) on delete set null, stopped_at timestamptz, stop_reason text);
create index if not exists idx_medorders_adm on ipd_med_orders(admission_id,status);
create table if not exists ipd_med_doses(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 order_id uuid not null references ipd_med_orders(id) on delete cascade,
 admission_id uuid not null references admissions(id) on delete cascade,
 scheduled_at timestamptz not null,
 status text not null check(status in ('given','held','refused','missed')),
 note text, recorded_by uuid references users(id) on delete set null, recorded_at timestamptz not null default now(),
 unique(order_id,scheduled_at));
create index if not exists idx_doses_adm on ipd_med_doses(admission_id,scheduled_at);
create table if not exists ipd_charts(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 admission_id uuid not null references admissions(id) on delete cascade,
 kind text not null check(kind in ('vitals','intake','output')),
 recorded_at timestamptz not null default now(),
 data jsonb not null default '{}'::jsonb, note text,
 recorded_by uuid references users(id) on delete set null);
create index if not exists idx_charts_adm on ipd_charts(admission_id,kind,recorded_at desc);
create table if not exists ipd_notes(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 admission_id uuid not null references admissions(id) on delete cascade,
 kind text not null check(kind in ('nursing','round')),
 text text not null, plan text,
 created_by uuid references users(id) on delete set null, created_at timestamptz not null default now());
create index if not exists idx_ipdnotes_adm on ipd_notes(admission_id,created_at desc);
