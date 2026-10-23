-- 033: three plans (Clinic / Basic / AI+Engagement). Prices = Market PMS India list, ex-GST.
-- Trial is 30 days on Basic only (enforced in app code via TRIAL_DAYS + force plan=basic on free signup).
-- Clinic = online + token booking. Basic = full hospital ops (no AI/engagement). AI+ = Basic + AI + engagement.
insert into plans(code,name,monthly_price_inr,modules,max_users,max_patients,sort,active) values
 ('clinic','Clinic',1999,array['patients','appointments','queue','opd'],null,null,1,true)
on conflict(code) do update set name=excluded.name,monthly_price_inr=excluded.monthly_price_inr,modules=excluded.modules,max_users=null,max_patients=null,sort=1,active=true;
update plans set name='Basic',monthly_price_inr=19999,modules=array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk'],max_users=null,max_patients=null,sort=2,active=true where code='basic';
update plans set name='AI + Customer Engagement',monthly_price_inr=49999,modules=array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk','ai','engagement'],max_users=null,max_patients=null,sort=3,active=true where code='ai_engage';
-- Keep legacy codes inactive (already mapped by canonicalPlan).
update plans set active=false,sort=9 where code in ('pro','enterprise') and active=true;
