create table if not exists hospital_integrations(
 hospital_id uuid not null references hospitals(id) on delete cascade,
 kind text not null check(kind in('whatsapp','google','email')),
 config jsonb not null default '{}',
 secrets text,
 status text not null default 'not_configured',
 last_error text,
 last_tested_at timestamptz,
 updated_by uuid references users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(hospital_id,kind));
