-- 030: SaaS sales CRM (platform-level, not tenant data)
create table if not exists saas_leads(
  id uuid primary key default gen_random_uuid(),
  name text not null, hospital_name text not null, phone text not null, email text, city text, beds int,
  message text, source text not null default 'website', status text not null default 'new',
  notes text, next_follow_up date, ip_hash text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint saas_leads_status check (status in ('new','contacted','demo','trial','won','lost')));
create index if not exists saas_leads_status_idx on saas_leads(status,created_at desc);
create index if not exists saas_leads_ip_idx on saas_leads(ip_hash,created_at desc);
