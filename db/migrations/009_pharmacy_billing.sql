-- 009: per-hospital pharmacy billing mode + dispensed line items (source for auto-billing / cash-sale receipts).
alter table hospitals add column if not exists pharmacy_billing text not null default 'patient_bill';
do $$ begin alter table hospitals add constraint hospitals_pharmacy_billing_chk check (pharmacy_billing in ('patient_bill','cash_sale')); exception when duplicate_object then null; end $$;
create table if not exists dispensed_items(
 id uuid primary key default gen_random_uuid(),
 hospital_id uuid not null references hospitals(id) on delete cascade,
 prescription_id uuid not null references prescriptions(id) on delete cascade,
 patient_id uuid not null references patients(id) on delete cascade,
 medicine_id uuid not null references medicines(id) on delete cascade,
 description text not null,
 quantity int not null check(quantity>0),
 unit_price numeric(12,2) not null default 0 check(unit_price>=0),
 dispensed_by uuid references users(id) on delete set null,
 created_at timestamptz not null default now());
create index if not exists idx_dispensed_patient on dispensed_items(hospital_id,patient_id);
