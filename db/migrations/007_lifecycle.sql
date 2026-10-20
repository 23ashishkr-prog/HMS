-- 007: subscription lifecycle: 2-month trial → on_hold → purge after HOLD_MONTHS (minimal patient register kept).
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check check(status in ('trialing','active','past_due','cancelled','expired','on_hold'));
alter table subscriptions add column if not exists hold_started_at timestamptz;
alter table subscriptions add column if not exists hold_extended_until timestamptz;
alter table subscriptions add column if not exists purged_at timestamptz;
create table if not exists lifecycle_notices(id bigserial primary key,hospital_id uuid not null references hospitals(id) on delete cascade,kind text not null check(kind in ('trial_ending','purge_pending','on_hold','purged')),days_left int not null default 0,channel text not null default 'in_app',cycle_start timestamptz not null,created_at timestamptz not null default now(),dismissed_at timestamptz,unique(hospital_id,kind,days_left,cycle_start));
-- Existing trials move to the new 2-month trial measured from sign-up (never shortened).
update subscriptions s set trial_ends_at=greatest(coalesce(s.trial_ends_at,now()),h.created_at+interval '2 months'),updated_at=now() from hospitals h where h.id=s.hospital_id and s.status='trialing';
