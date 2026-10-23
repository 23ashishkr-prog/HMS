-- 034: Razorpay plan-subscription checkout fields + payment ledger (NOT patient billing)
alter table subscriptions add column if not exists current_period_start timestamptz;
alter table subscriptions add column if not exists last_payment_id text;
alter table subscriptions add column if not exists last_order_id text;
alter table subscriptions add column if not exists billing_period text;
do $$ begin
  alter table subscriptions add constraint subscriptions_billing_period_check
    check (billing_period is null or billing_period in ('monthly','annual'));
exception when duplicate_object then null;
end $$;

-- Ledger of hospital plan payments only (Clinic/Basic/AI+). Patient bills stay in-app.
create table if not exists subscription_payments(
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  plan_code text not null,
  billing_period text not null check (billing_period in ('monthly','annual')),
  amount_inr numeric(12,2) not null,
  currency text not null default 'INR',
  status text not null default 'captured' check (status in ('created','authorized','captured','failed','refunded')),
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  provider_signature_ok boolean,
  raw jsonb,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists subscription_payments_provider_payment_uid
  on subscription_payments(provider, provider_payment_id) where provider_payment_id is not null;
create index if not exists subscription_payments_hospital_idx on subscription_payments(hospital_id, paid_at desc);
