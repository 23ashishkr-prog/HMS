-- 039: Idempotent hospital-gateway payment ids, and per-user navigation favourites.
-- Favourites are private to the signed-in user (hospital_id + user_id). No cross-user reads.

create unique index if not exists payments_provider_payment_uidx
  on payments (hospital_id, provider, provider_payment_id)
  where provider is not null and provider_payment_id is not null;

create unique index if not exists hgp_payment_uidx
  on hospital_gateway_payments (hospital_id, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists user_nav_usage (
  user_id uuid not null references users(id) on delete cascade,
  hospital_id uuid not null references hospitals(id) on delete cascade,
  path text not null,
  hits integer not null default 0 check (hits >= 0),
  starred boolean not null default false,
  dismissed boolean not null default false,
  last_opened_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);
create index if not exists user_nav_usage_hospital_idx on user_nav_usage (hospital_id, user_id);
