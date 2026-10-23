-- 035: Platform-level Razorpay gateway settings (SaaS owner only) + payment check indexes
-- Secrets encrypted at rest with INTEGRATIONS_ENC_KEY (same as hospital WhatsApp).

create table if not exists platform_settings(
  key text primary key,
  config jsonb not null default '{}'::jsonb,
  secrets text,
  updated_by uuid references platform_admins(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payments_status_paid_idx
  on subscription_payments(status, paid_at desc);
create index if not exists subscription_payments_order_idx
  on subscription_payments(provider, provider_order_id) where provider_order_id is not null;
