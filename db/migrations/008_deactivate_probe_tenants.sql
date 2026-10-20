-- 008: deactivate the two diagnostic test tenants created on 2026-10-20 while debugging sign-up.
-- Matched on code AND name AND admin email so no real hospital can be affected. Nothing is deleted.
update hospitals set status='deactivated',updated_at=now() where (code='ZZPROBE' and name='ZZ Probe Delete Me') or (code='ZZPROBETWO' and name='zz_probe_Two');
update users set active=false,updated_at=now() where lower(email) in ('probe+zz@example.com','probe.two@example.com') and hospital_id in (select id from hospitals where code in ('ZZPROBE','ZZPROBETWO') and status='deactivated');
