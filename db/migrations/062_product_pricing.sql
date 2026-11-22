-- 062: One price book for every GreyNova product, edited in the platform console.
-- HMS checkout, the public site, TailDesk and Smart Shop read it through /api/public/pricing.
-- Prices are monthly INR, ex-GST. An offer takes a percentage off for a date range.

create table if not exists product_prices(
  product text not null check (product in ('hms','taildesk','smartshop')),
  plan_code text not null,
  name text not null,
  monthly_inr numeric(12,2) not null check (monthly_inr >= 1 and monthly_inr <= 10000000),
  sort integer not null default 0,
  updated_by uuid references platform_admins(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (product, plan_code)
);

create table if not exists product_offers(
  id uuid primary key default gen_random_uuid(),
  product text not null check (product in ('hms','taildesk','smartshop')),
  plan_code text,                      -- null: every plan of the product
  percent numeric(5,2) not null check (percent > 0 and percent <= 90),
  label text not null default '',
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  created_by uuid references platform_admins(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ends_on >= starts_on)
);
create index if not exists product_offers_live_idx on product_offers(product, starts_on, ends_on) where active;

create table if not exists product_price_log(
  id bigserial primary key,
  product text not null,
  plan_code text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  by_admin uuid references platform_admins(id) on delete set null,
  by_email text,
  at timestamptz not null default now()
);

insert into product_prices(product, plan_code, name, monthly_inr, sort) values
  ('hms', 'clinic', 'Clinic (Basic)', 1989, 1),
  ('hms', 'engage', 'Customer Engagement', 49890, 2),
  ('hms', 'engage_support', 'Customer Engagement + 1 Support Admin', 89700, 3),
  ('taildesk', 'hospital', 'TailDesk Complete', 1489, 1),
  ('smartshop', 'standard', 'Smart Shop Standard', 2489, 1)
on conflict (product, plan_code) do nothing;
