-- 038: trial start timestamp + one-trial-per-organisation identity lock.
-- plan, status and trial_ends_at already live on subscriptions.
alter table subscriptions add column if not exists trial_started_at timestamptz;
update subscriptions s
   set trial_started_at = coalesce(s.trial_started_at, h.created_at)
  from hospitals h
 where h.id = s.hospital_id
   and s.trial_ends_at is not null
   and s.trial_started_at is null;

create table if not exists trial_claims (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references hospitals(id) on delete cascade,
  kind text not null check (kind in ('email','phone','name','gstin')),
  norm text not null,
  blocked boolean not null default true,
  created_at timestamptz not null default now(),
  reset_at timestamptz,
  reset_by text,
  unique (kind, norm)
);
create index if not exists idx_trial_claims_hospital on trial_claims(hospital_id);
