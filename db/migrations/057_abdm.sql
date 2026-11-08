-- ABDM (Ayushman Bharat Digital Mission) M1-M3: ABHA on patients, per-hospital HIP/HIU settings, gateway request log,
-- care contexts, consents (HIP + HIU), health-information transfers, received records, and Scan & Share tokens.
-- abha_number / abha_address already exist on patients (002_pms_workflows).
alter table patients add column if not exists abha_status text not null default 'none';
alter table patients add column if not exists abha_kyc text;
alter table patients add column if not exists abha_linked_at timestamptz;
alter table patients add column if not exists abha_profile jsonb;
alter table patients add column if not exists abdm_link_token text;
alter table patients add column if not exists abdm_link_token_exp timestamptz;
create index if not exists idx_patients_abha_number on patients(hospital_id,abha_number) where abha_number is not null;
create index if not exists idx_patients_abha_address on patients(hospital_id,lower(abha_address)) where abha_address is not null;

create table if not exists abdm_settings(hospital_id uuid primary key references hospitals(id) on delete cascade,mode text not null default 'off' check(mode in ('off','sandbox','production')),hfr_id text,hip_id text,hiu_id text,hip_name text,counter_code text not null default 'reception',updated_by uuid references users(id) on delete set null,updated_at timestamptz not null default now());
create unique index if not exists idx_abdm_settings_hip on abdm_settings(hip_id) where hip_id is not null;
create unique index if not exists idx_abdm_settings_hiu on abdm_settings(hiu_id) where hiu_id is not null;

-- Every call to and from the gateway. Aadhaar numbers and OTPs are redacted before they are stored.
create table if not exists abdm_requests(id uuid primary key default gen_random_uuid(),hospital_id uuid references hospitals(id) on delete cascade,patient_id uuid references patients(id) on delete set null,request_id text not null,direction text not null default 'out' check(direction in ('out','in')),api text not null,payload jsonb,response jsonb,http_status int,status text not null default 'sent' check(status in ('sent','acked','callback','error','received')),callback jsonb,callback_at timestamptz,meta jsonb,error text,created_at timestamptz not null default now());
create index if not exists idx_abdm_requests_rid on abdm_requests(request_id);
create index if not exists idx_abdm_requests_hosp on abdm_requests(hospital_id,created_at desc);

-- Short-lived OTP flows (ABHA enrol / login, user-initiated linking). Holds gateway txn ids and user tokens server-side.
create table if not exists abdm_sessions(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid references patients(id) on delete cascade,kind text not null,txn_id text,state jsonb not null default '{}'::jsonb,status text not null default 'open',created_by uuid references users(id) on delete set null,expires_at timestamptz not null default now()+interval '30 minutes',created_at timestamptz not null default now());
create index if not exists idx_abdm_sessions_txn on abdm_sessions(txn_id);

create table if not exists abdm_care_contexts(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,kind text not null check(kind in ('visit','lab','discharge')),ref_id uuid not null,reference text not null,display text not null,hi_types text[] not null default '{}',status text not null default 'pending' check(status in ('pending','linking','linked','failed')),link_request_id text,linked_via text,linked_at timestamptz,error text,created_at timestamptz not null default now(),unique(hospital_id,kind,ref_id),unique(hospital_id,reference));
create index if not exists idx_abdm_cc_patient on abdm_care_contexts(hospital_id,patient_id,created_at desc);

-- role hiu = consent requests this hospital raised; artefacts store both HIP-side (received grants) and HIU-side artefacts.
create table if not exists abdm_consents(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid references patients(id) on delete set null,abha_address text not null,request_id text,consent_request_id text,status text not null default 'REQUESTED',purpose text not null default 'CAREMGT',hi_types text[] not null default '{}',date_from timestamptz not null,date_to timestamptz not null,expires_at timestamptz not null,created_by uuid references users(id) on delete set null,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists idx_abdm_consents_crid on abdm_consents(consent_request_id);
create table if not exists abdm_consent_artefacts(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,consent_id uuid references abdm_consents(id) on delete cascade,role text not null check(role in ('hip','hiu')),artefact_id text not null,status text not null default 'GRANTED',abha_address text,patient_id uuid references patients(id) on delete set null,hi_types text[] not null default '{}',date_from timestamptz,date_to timestamptz,data_erase_at timestamptz,care_contexts jsonb not null default '[]'::jsonb,detail jsonb,signature text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(hospital_id,role,artefact_id));

create table if not exists abdm_hi_transfers(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,role text not null check(role in ('hip','hiu')),artefact_id text not null,transaction_id text,request_id text,status text not null default 'REQUESTED',data_push_url text,key_material jsonb,private_key text,date_from timestamptz,date_to timestamptz,entries int not null default 0,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists idx_abdm_hit_txn on abdm_hi_transfers(transaction_id);
create table if not exists abdm_hi_records(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,transfer_id uuid not null references abdm_hi_transfers(id) on delete cascade,care_context_reference text,hi_type text,bundle jsonb,error text,received_at timestamptz not null default now());
create index if not exists idx_abdm_hir_transfer on abdm_hi_records(transfer_id);

-- Scan & Share: patient scans the facility QR in their PHR app; the shared profile lands here with a desk token.
create table if not exists abdm_share_tokens(id uuid primary key default gen_random_uuid(),hospital_id uuid not null references hospitals(id) on delete cascade,patient_id uuid not null references patients(id) on delete cascade,share_date date not null,token_no int not null,counter_code text,abha_address text,profile jsonb,status text not null default 'waiting' check(status in ('waiting','checked_in','dismissed')),queue_id uuid references doctor_queue(id) on delete set null,created_new boolean not null default false,created_at timestamptz not null default now(),unique(hospital_id,share_date,token_no));
create index if not exists idx_abdm_share_day on abdm_share_tokens(hospital_id,share_date,status);
