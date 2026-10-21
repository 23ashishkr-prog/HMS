-- 031: two plans only. Prices are per month (plans.monthly_price_inr). Trial stays 2 months (TRIAL_MONTHS).
-- Basic = full hospital operations. AI + Customer Engagement = Basic + AI doctor assistant + engagement (WhatsApp/e-mail, patient portal, reminders).
insert into plans(code,name,monthly_price_inr,modules,max_users,max_patients,sort,active) values
 ('ai_engage','AI + Customer Engagement',49999,array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','ai','engagement'],null,null,2,true)
on conflict(code) do update set name=excluded.name,monthly_price_inr=excluded.monthly_price_inr,modules=excluded.modules,max_users=null,max_patients=null,sort=2,active=true;
update plans set name='Basic',monthly_price_inr=19999,modules=array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit'],max_users=null,max_patients=null,sort=1,active=true where code='basic';
-- Old Pro / Enterprise both included AI, so they map to AI + Customer Engagement (nobody loses a feature).
update subscriptions set plan_code='ai_engage',updated_at=now() where plan_code in ('pro','enterprise');
update plans set active=false,sort=9 where code in ('pro','enterprise');
