-- 011: AI doctor assistant (doctor-in-the-loop). Off by default per hospital; plan-gated ('ai' module on Pro/Enterprise).
update plans set modules=array_append(modules,'ai') where code in ('pro','enterprise') and not ('ai'=any(modules));
alter table hospitals add column if not exists ai_enabled boolean not null default false;
alter table hospitals add column if not exists ai_patient_consent boolean not null default false;
alter table hospitals add column if not exists ai_monthly_token_cap int not null default 200000;
create table if not exists ai_usage(hospital_id uuid not null references hospitals(id) on delete cascade,month text not null,tokens int not null default 0,calls int not null default 0,primary key(hospital_id,month));
create table if not exists ai_suggestions(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,user_id uuid references users(id) on delete set null,patient_id uuid references patients(id) on delete cascade,feature text not null,output jsonb not null,checks jsonb,status text not null default 'suggested' check(status in ('suggested','accepted','edited','rejected')),final jsonb,tokens int not null default 0,model text,created_at timestamptz not null default now(),decided_at timestamptz);
create index if not exists idx_ai_sugg on ai_suggestions(hospital_id,created_at desc);
