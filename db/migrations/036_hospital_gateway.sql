-- 036: Per-hospital payment gateway (tenant-isolated) + invoice gateway ledger
-- NEVER shares platform SaaS Razorpay keys. Encrypted like WhatsApp (INTEGRATIONS_ENC_KEY).

alter table hospital_integrations drop constraint if exists hospital_integrations_kind_check;
alter table hospital_integrations add constraint hospital_integrations_kind_check
  check (kind in ('whatsapp','google','email','payments'));

-- Allow razorpay as a recorded payment mode on invoices
alter table payments drop constraint if exists payments_mode_check;
alter table payments add constraint payments_mode_check
  check (mode in ('cash','upi','card','netbanking','insurance','other','razorpay'));

alter table payments add column if not exists provider text;
alter table payments add column if not exists provider_order_id text;
alter table payments add column if not exists provider_payment_id text;

create table if not exists hospital_gateway_payments(
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  patient_id uuid references patients(id) on delete set null,
  gateway text not null default 'razorpay',
  amount_inr numeric(12,2) not null check(amount_inr>0),
  currency text not null default 'INR',
  status text not null default 'created'
    check(status in ('created','authorized','captured','failed','refunded')),
  provider_order_id text,
  provider_payment_id text,
  provider_signature_ok boolean,
  paid_at timestamptz,
  raw jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hgp_hospital_paid_idx on hospital_gateway_payments(hospital_id, (coalesce(paid_at,created_at)) desc);
create index if not exists hgp_status_idx on hospital_gateway_payments(hospital_id, status);
create index if not exists hgp_order_idx on hospital_gateway_payments(hospital_id, provider_order_id)
  where provider_order_id is not null;
