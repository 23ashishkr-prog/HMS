-- 004: multi-tenant SaaS: tenant settings, plans, subscriptions, platform super-admins.
alter table hospitals add column if not exists address text;
alter table hospitals add column if not exists gstin text;
alter table hospitals add column if not exists uhid_prefix text;
alter table hospitals add column if not exists contact_email text;
alter table hospitals add column if not exists contact_phone text;
alter table hospitals add column if not exists status text not null default 'active';

-- Plans are genuine master data (pricing/module catalogue), editable by the platform super-admin.
create table if not exists plans(code text primary key,name text not null,monthly_price_inr numeric(12,2) not null,modules text[] not null,max_users int,max_patients int,active boolean not null default true,sort int not null default 0);
insert into plans(code,name,monthly_price_inr,modules,max_users,max_patients,sort) values
 ('basic','Basic',0,array['patients','appointments','queue','opd','billing'],5,2000,1),
 ('pro','Pro',0,array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd'],25,null,2),
 ('enterprise','Enterprise',0,array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit'],null,null,3)
on conflict(code) do nothing;
-- Prices are 0 placeholders until the owner sets real prices (update plans set monthly_price_inr=...).

create table if not exists subscriptions(hospital_id uuid primary key references hospitals(id) on delete cascade,plan_code text not null references plans(code),status text not null default 'trialing' check(status in ('trialing','active','past_due','cancelled','expired')),trial_ends_at timestamptz,current_period_end timestamptz,provider text,provider_customer_id text,provider_subscription_id text,updated_at timestamptz not null default now());
-- Existing hospitals (created before SaaS) get Enterprise so nothing they use is switched off.
insert into subscriptions(hospital_id,plan_code,status) select id,'enterprise','active' from hospitals on conflict do nothing;
create table if not exists subscription_events(id bigserial primary key,hospital_id uuid references hospitals(id) on delete cascade,provider text not null,event_type text not null,payload jsonb not null,received_at timestamptz not null default now());

create table if not exists platform_admins(id uuid primary key default gen_random_uuid(),email text not null unique,full_name text not null,password_hash text not null,active boolean not null default true,created_at timestamptz not null default now());
