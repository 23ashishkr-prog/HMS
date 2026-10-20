-- QR self check-in + WhatsApp booking (both off by default, per hospital)
alter table hospitals add column if not exists self_checkin_enabled boolean not null default false;
alter table hospitals add column if not exists checkin_key text not null default encode(gen_random_bytes(12),'hex');
alter table hospitals add column if not exists whatsapp_booking_enabled boolean not null default false;
create table if not exists self_checkin_attempts(id bigserial primary key,hospital_id uuid not null references hospitals(id) on delete cascade,mobile text,ok boolean not null,created_at timestamptz not null default now());
create index if not exists idx_selfci_attempts on self_checkin_attempts(hospital_id,mobile,created_at);
