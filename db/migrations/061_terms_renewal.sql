-- Agreement and the renewal clock for payments taken after this version.
-- Existing rows keep renewal_policy null, so their access and purge timing do not change.
alter table subscriptions add column if not exists terms_version text;
alter table subscriptions add column if not exists terms_agreed_at timestamptz;
alter table subscriptions add column if not exists auto_renew boolean not null default true;
alter table subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table subscriptions add column if not exists renewal_policy text;
alter table subscriptions add column if not exists payment_failed_at timestamptz;

alter table subscription_payments add column if not exists terms_version text;
alter table subscription_payments add column if not exists terms_agreed_at timestamptz;
