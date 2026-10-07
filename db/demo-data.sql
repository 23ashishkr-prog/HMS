-- AEGIS demo dataset: exactly two demo patients.
-- Run after db/schema.sql and db/bootstrap.sql.
insert into patients(hospital_id,uhid,full_name,mobile,gender,date_of_birth,blood_group,address)
select h.id,v.uhid,v.full_name,v.mobile,v.gender,v.dob::date,v.blood_group,v.address from hospitals h cross join (values
('HSP-001234','Arjun Kumar','+91 98765 43210','Male','1978-04-12','B+','Bengaluru'),
('HSP-001891','Priya Singh','+91 99887 76655','Female','1991-08-23','O+','Bengaluru')
) v(uhid,full_name,mobile,gender,dob,blood_group,address) where h.code='AEGIS'
on conflict(hospital_id,uhid) do update set full_name=excluded.full_name,mobile=excluded.mobile,gender=excluded.gender,date_of_birth=excluded.date_of_birth,blood_group=excluded.blood_group,address=excluded.address,updated_at=now();

delete from patients where hospital_id=(select id from hospitals where code='AEGIS') and uhid not in ('HSP-001234','HSP-001891');

insert into patient_assignments(hospital_id,patient_id,doctor_user_id,active)
select p.hospital_id,p.id,u.id,true from patients p join users u on u.hospital_id=p.hospital_id and u.email='doctor@aegishms.test'
where p.uhid in ('HSP-001234','HSP-001891') and not exists(select 1 from patient_assignments a where a.patient_id=p.id and a.doctor_user_id=u.id and a.active=true);

insert into doctor_queue(hospital_id,patient_id,doctor_user_id,status,checked_in_at)
select p.hospital_id,p.id,u.id,case when p.uhid='HSP-001234' then 'waiting' else 'checked' end,case when p.uhid='HSP-001234' then now()-interval '20 minutes' else now()-interval '2 hours' end
from patients p join users u on u.hospital_id=p.hospital_id and u.email='doctor@aegishms.test'
where p.uhid in ('HSP-001234','HSP-001891') and not exists(select 1 from doctor_queue q where q.patient_id=p.id);

insert into clinical_notes(hospital_id,patient_id,doctor_user_id,summary)
select p.hospital_id,p.id,u.id,'Previous consultation: stable vitals. Follow-up advised with routine blood tests.'
from patients p join users u on u.hospital_id=p.hospital_id and u.email='doctor@aegishms.test'
where p.uhid='HSP-001891' and not exists(select 1 from clinical_notes n where n.patient_id=p.id);

insert into lab_reports(hospital_id,patient_id,report_type,report_name,notes,status,uploaded_by)
select p.hospital_id,p.id,'CBC','Complete Blood Count','Demo CBC report record.','ready',u.id
from patients p join users u on u.hospital_id=p.hospital_id and u.email='lab@aegishms.test'
where p.uhid='HSP-001891' and not exists(select 1 from lab_reports r where r.patient_id=p.id);

insert into prescriptions(hospital_id,patient_id,doctor_user_id,status)
select p.hospital_id,p.id,u.id,'pending' from patients p join users u on u.hospital_id=p.hospital_id and u.email='doctor@aegishms.test'
where p.uhid='HSP-001891' and not exists(select 1 from prescriptions pr where pr.patient_id=p.id);
insert into prescription_items(prescription_id,medicine_name,dose,frequency,duration,quantity,instructions)
select pr.id,'Paracetamol','500 mg','Twice daily','3 days','6 tablets','After food' from prescriptions pr join patients p on p.id=pr.patient_id
where p.uhid='HSP-001891' and not exists(select 1 from prescription_items i where i.prescription_id=pr.id);
