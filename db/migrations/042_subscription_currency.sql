-- 042: platform subscription tracking stores currency + INR equivalent.
-- Additive only: no drops, no rewrites of amount_inr. Existing rows stay.
-- HMS charges are INR, so amount_in_inr is backfilled from amount_inr.

alter table subscriptions add column if not exists currency text;
alter table subscriptions add column if not exists amount_in_inr numeric(12,2);
update subscriptions set currency='INR' where currency is null or btrim(currency)='';
alter table subscriptions alter column currency set default 'INR';
alter table subscriptions alter column currency set not null;

alter table subscription_payments add column if not exists amount_in_inr numeric(12,2);
update subscription_payments
  set amount_in_inr=amount_inr
  where amount_in_inr is null
    and upper(coalesce(nullif(btrim(currency),''),'INR'))='INR';

update subscriptions s
set amount_in_inr=p.amount_inr,
    currency=coalesce(nullif(btrim(s.currency),''), nullif(btrim(p.currency),''), 'INR')
from (
  select distinct on (hospital_id) hospital_id, amount_inr, currency
  from subscription_payments
  where status in ('captured','authorized') and amount_inr is not null
  order by hospital_id, coalesce(paid_at, created_at) desc
) p
where s.hospital_id=p.hospital_id and s.amount_in_inr is null;
