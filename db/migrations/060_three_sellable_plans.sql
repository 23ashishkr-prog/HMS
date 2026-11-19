-- Three sellable Hospital Cloud plans. Old rows stay so current hospitals keep their plan, modules and price.
alter table plans add column if not exists included_support_admins integer not null default 0;

update plans set
  name='Clinic (Basic)',
  monthly_price_inr=1989,
  modules=array['patients','appointments','queue','opd'],
  max_users=null,
  max_patients=null,
  sort=1,
  active=true,
  included_support_admins=0
where code='clinic';

-- Hidden from new sign-ups and the upgrade picker. Prices and modules are unchanged.
update plans set active=false where code in ('basic','ai_engage','pro','enterprise');

insert into plans(code,name,monthly_price_inr,modules,max_users,max_patients,sort,active,included_support_admins) values
 ('engage','Customer Engagement',49890,array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk','ai','engagement'],null,null,2,true,0),
 ('engage_support','Customer Engagement + 1 Support Admin',89700,array['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk','ai','engagement'],null,null,3,true,1)
on conflict(code) do update set
  name=excluded.name,
  monthly_price_inr=excluded.monthly_price_inr,
  modules=excluded.modules,
  max_users=null,
  max_patients=null,
  sort=excluded.sort,
  active=true,
  included_support_admins=excluded.included_support_admins;
