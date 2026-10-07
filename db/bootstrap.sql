-- Run once against the HMS database. Change the temporary password immediately after first login.
\i schema.sql
insert into hospitals(name,code) values('Aegis Hospital','AEGIS') on conflict(code) do update set name=excluded.name;
-- PostgreSQL crypt() hashes the temporary password; plaintext is never stored.
insert into users(hospital_id,email,full_name,role,password_hash,must_change_password)
select h.id,v.email,v.full_name,v.role::hms_role,crypt('Welcome@2027',gen_salt('bf',12)),true
from hospitals h
cross join (values
 ('admin@aegishms.test','Aegis Administrator','admin'),
 ('reception@aegishms.test','Reception Desk','reception'),
 ('doctor@aegishms.test','Dr Raj Sharma','doctor'),
 ('lab@aegishms.test','Laboratory User','lab'),
 ('pharmacy@aegishms.test','Pharmacy User','pharmacy'),
 ('patient@aegishms.test','Demo Patient','patient')
) v(email,full_name,role)
where h.code='AEGIS'
on conflict(hospital_id,email) do update set full_name=excluded.full_name,role=excluded.role,password_hash=excluded.password_hash,must_change_password=true,active=true,updated_at=now();
