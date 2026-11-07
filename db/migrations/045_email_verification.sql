-- 045: staff and hospital-admin email verification.
-- Existing rows are stamped verified so current accounts (including Sudipta_Test and qa+ users) keep signing in.
-- DEFAULT now() covers inserts from the previous app version during the deploy window.
-- New sign-ups set the column to null only after a verification code is actually sent.
alter table users add column if not exists email_verified_at timestamptz default now();
update users set email_verified_at = now() where email_verified_at is null;

create table if not exists email_otps(
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  purpose text not null default 'verify',
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists email_otps_user on email_otps(user_id, created_at desc);
create index if not exists email_otps_ip on email_otps(ip, created_at desc);
