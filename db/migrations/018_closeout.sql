-- Daily close-out report (to hospital staff, not patients)
alter table hospitals add column if not exists closeout_enabled boolean not null default false;
alter table hospitals add column if not exists closeout_emails text[] not null default '{}';
alter table hospitals add column if not exists closeout_whatsapp text[] not null default '{}';
alter table hospitals add column if not exists closeout_time text not null default '21:00';
create table if not exists closeout_reports(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,report_date date not null,data jsonb not null,sent_to int not null default 0,created_at timestamptz not null default now(),unique(hospital_id,report_date));
