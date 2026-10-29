-- 040: Front-desk receipts when the plan has no billing module, atomic token numbers,
-- and per-user dismissal of the AI upsell line.

-- Renumber any same-day duplicate tokens for one doctor (keep earliest check-in first)
-- before the unique index is enforced. No-op when numbers are already unique.
with bad_days as (
  select distinct hospital_id, doctor_user_id, visit_date
  from (
    select hospital_id, doctor_user_id, visit_date, token_no
    from doctor_queue
    where token_no is not null
    group by 1, 2, 3, 4
    having count(*) > 1
  ) d
),
ranked as (
  select q.id,
    row_number() over (
      partition by q.hospital_id, q.doctor_user_id, q.visit_date
      order by q.checked_in_at, q.id
    ) as seq
  from doctor_queue q
  join bad_days b
    on b.hospital_id = q.hospital_id
   and b.doctor_user_id = q.doctor_user_id
   and b.visit_date = q.visit_date
)
update doctor_queue q
set token_no = r.seq
from ranked r
where q.id = r.id
  and q.token_no is distinct from r.seq;

create unique index if not exists idx_queue_token
  on doctor_queue (hospital_id, doctor_user_id, visit_date, token_no)
  where token_no is not null;

create table if not exists desk_receipts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  queue_id uuid not null unique references doctor_queue(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  mode text not null check (mode in ('cash','upi','card','netbanking','other')),
  reference text,
  description text,
  received_by uuid not null references users(id),
  received_at timestamptz not null default now()
);
create index if not exists desk_receipts_hosp_at on desk_receipts (hospital_id, received_at);

create table if not exists user_dismissals (
  user_id uuid not null references users(id) on delete cascade,
  hospital_id uuid not null references hospitals(id) on delete cascade,
  key text not null check (key in ('ai_upsell')),
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
