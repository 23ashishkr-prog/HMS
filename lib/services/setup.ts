/** Guided setup: progress checklist computed from live data + one-click sensible Indian defaults (idempotent upserts). */
import {Ctx,Db,audit,requireRole} from './core'
export const DEFAULT_SERVICES:[string,string,string,number][]=[
 ['OPD','General consultation','consultation',500],['OPD-SPL','Specialist consultation','consultation',800],['OPD-FU','Follow-up consultation (within 7 days)','consultation',300],['OPD-EMR','Emergency consultation','consultation',1000],
 ['CBC','Complete blood count (CBC)','lab',350],['FBS','Blood sugar – fasting','lab',100],['PPBS','Blood sugar – post prandial','lab',100],['HBA1C','HbA1c','lab',550],['LFT','Liver function test','lab',700],['KFT','Kidney function test','lab',700],['LIPID','Lipid profile','lab',650],['TSH','Thyroid profile (T3, T4, TSH)','lab',600],['URINE-R','Urine routine','lab',150],['DENGUE','Dengue NS1 antigen','lab',600],['WIDAL','Widal test','lab',250],['MP','Malaria parasite (smear)','lab',200],
 ['XR-CHEST','X-ray chest PA','radiology',400],['USG-ABD','USG whole abdomen','radiology',1200],['ECG','ECG','radiology',300],['ECHO','2D Echo','radiology',2000],
 ['DRESS','Dressing (minor)','procedure',200],['INJ','Injection charges','procedure',100],['NEB','Nebulisation','procedure',150],['IV','IV cannulation & fluids','procedure',300],
 ['BED-GEN','General ward bed (per day)','bed',1000],['BED-PVT','Private room (per day)','bed',3000],['BED-ICU','ICU bed (per day)','bed',6000],['REG','Registration fee','other',100]]
export const DEFAULT_DEPARTMENTS=['General Medicine','Paediatrics','Obstetrics & Gynaecology','Orthopaedics','General Surgery','ENT','Ophthalmology','Dermatology','Cardiology','Emergency','Laboratory','Radiology','Pharmacy']
export const DEFAULT_SESSIONS=[{start:'09:00',end:'13:00'},{start:'17:00',end:'20:00'}] // Mon–Sat
export async function setupStatus(db:Db,ctx:Ctx){requireRole(ctx,['admin']);const h=ctx.hospitalId;const r=(await db.query(`select h.address,h.gstin,h.contact_phone phone,
 (select count(*)::int from service_catalog where hospital_id=$1 and category='consultation' and active) consult,(select count(*)::int from service_catalog where hospital_id=$1 and active) services,
 (select count(*)::int from departments where hospital_id=$1) depts,(select count(distinct role)::int from users where hospital_id=$1 and active and role<>'admin') roles,
 (select count(*)::int from users where hospital_id=$1 and role='doctor' and active) doctors,(select count(distinct a.doctor_user_id)::int from doctor_availability a join users u on u.id=a.doctor_user_id where a.hospital_id=$1 and u.active) scheduled,
 (select count(*)::int from beds where hospital_id=$1 and active) beds,(select count(*)::int from medicines where hospital_id=$1) meds,
 (select count(*)::int from hospital_integrations where hospital_id=$1 and kind in('whatsapp','email') and status in('connected','configured')) integ,
 h.self_checkin_enabled or h.public_booking_enabled selfsvc from hospitals h where h.id=$1`,[h])).rows[0]
 const steps=[{id:'profile',title:'Hospital profile',detail:'Address, phone and GSTIN print on invoices',done:!!(r.address&&r.phone),href:'/admin/hospital-profile'},
  {id:'services',title:'Services & prices',detail:`${r.services} services (${r.consult} consultation)`,done:r.consult>0&&r.services>=5,href:'/admin/settings',defaults:'services'},
  {id:'departments',title:'Departments',detail:`${r.depts} departments`,done:r.depts>0,href:'/admin/import',defaults:'departments'},
  {id:'users',title:'Staff accounts',detail:`${r.roles} of 6 staff roles have a user`,done:r.roles>=3,href:'/admin/users'},
  {id:'schedules',title:'Doctor OPD timings',detail:`${r.scheduled} of ${r.doctors} doctors have timings`,done:r.doctors>0&&r.scheduled>=r.doctors,href:'/schedules',defaults:'schedules'},
  {id:'beds',title:'Wards & beds',detail:`${r.beds} beds`,done:r.beds>0,href:'/ipd',defaults:'beds',optional:true},
  {id:'pharmacy',title:'Medicines',detail:`${r.meds} medicines`,done:r.meds>0,href:'/admin/import',optional:true},
  {id:'integrations',title:'WhatsApp / e-mail',detail:r.integ?'connected':'not set up — patients get no messages',done:r.integ>0,href:'/admin/integrations'},
  {id:'selfservice',title:'QR check-in / online booking',detail:r.selfsvc?'on':'off',done:!!r.selfsvc,href:'/checkin-qr',optional:true}]
 const req=steps.filter(s=>!s.optional);return {steps,progress:Math.round(100*req.filter(s=>s.done).length/req.length),done:req.every(s=>s.done)}}
export async function applyDefaults(db:Db,ctx:Ctx,what:string){requireRole(ctx,['admin']);const h=ctx.hospitalId;let n=0
 if(what==='services'||what==='all')for(const [code,name,cat,price] of DEFAULT_SERVICES){const r=await db.query('insert into service_catalog(hospital_id,code,name,category,price) values($1,$2,$3,$4,$5) on conflict(hospital_id,code) do nothing returning id',[h,code,name,cat,price]);n+=r.rows.length}
 if(what==='departments'||what==='all')for(const d of DEFAULT_DEPARTMENTS){const r=await db.query('insert into departments(hospital_id,name) values($1,$2) on conflict(hospital_id,name) do nothing returning id',[h,d]);n+=r.rows.length}
 if(what==='schedules'||what==='all'){const docs=(await db.query("select u.id from users u where u.hospital_id=$1 and u.role='doctor' and u.active and not exists(select 1 from doctor_availability a where a.doctor_user_id=u.id)",[h])).rows;for(const d of docs)for(let day=1;day<=6;day++)for(const s of DEFAULT_SESSIONS){await db.query('insert into doctor_availability(hospital_id,doctor_user_id,day_of_week,start_time,end_time,slot_minutes) values($1,$2,$3,$4,$5,15) on conflict do nothing',[h,d.id,day,s.start,s.end]);n++}}
 if(what==='beds'||what==='all'){const has=(await db.query('select 1 from beds where hospital_id=$1 limit 1',[h])).rows[0];if(!has){const add=async(ward:string,pre:string,k:number,type:string,rate:number)=>{for(let i=1;i<=k;i++){await db.query('insert into beds(hospital_id,ward,bed_no,bed_type,daily_rate) values($1,$2,$3,$4,$5) on conflict do nothing',[h,ward,pre+i,type,rate]);n++}};await add('General Ward','G',10,'general',1000);await add('Private','P',4,'private',3000);await add('ICU','ICU',2,'icu',6000)}}
 await audit(db,ctx,'setup_defaults','hospital',h,{what,added:n});return {added:n,...await setupStatus(db,ctx)}}
