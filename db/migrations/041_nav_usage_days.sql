alter table user_nav_usage add column if not exists days integer not null default 0;
alter table user_nav_usage add column if not exists last_day date;
-- Reset counts so nothing is auto-starred from the old 3-click rule.
update user_nav_usage set hits=0 where starred=false;
