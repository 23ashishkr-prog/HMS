-- 029: e-mailed password reset / staff invite links (token stored as SHA-256 hash only)
create table if not exists password_resets(
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'reset',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists password_resets_user on password_resets(user_id,created_at desc);
