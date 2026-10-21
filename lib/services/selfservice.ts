import {doctorStatuses} from './doctorsched'
/** Patient self-service: QR self check-in at the hospital and WhatsApp booking. Both are off until an admin enables them. */
import {Ctx,Db,HttpError,audit,today} from './core'
import {checkIn} from './opd'
import {normalizeMobile} from './patients'
import {freeSlots} from './patientcomms'
import {enqueue} from './notify'
import {istToUtc} from './schedule'
import crypto from 'node:crypto'
async function hosp(db:Db,code:string,key:string){const h=(await db.query('select id,name,code,self_checkin_enabled,checkin_key from hospitals where upper(code)=upper($1)',[String(code||'')])).rows[0];const a=Buffer.from(String(h?.checkin_key||'x')),b=Buffer.from(String(key||''));if(!h||!h.self_checkin_enabled||a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new HttpError(404,'This check-in QR is not active. Please go to reception.');return h}
const systemCtx=async(db:Db,hid:string):Promise<Ctx>=>{const u=(await db.query("select id from users where hospital_id=$1 and role='admin' and active order by created_at limit 1",[hid])).rows[0];if(!u)throw new HttpError(503,'Self check-in unavailable. Please go to reception.');return {hospitalId:hid,userId:u.id,role:'reception'}}
export async function checkinInfo(db:Db,code:string,key:string){const h=await hosp(db,code,key);const d=(await doctorStatuses(db,h.id)).filter(x=>x.status!=='on_leave'&&x.online).map(x=>({id:x.id,full_name:x.full_name,available:x.status==='available'}));return {hospital:h.name,doctors:d}}
/** Patient identifies with mobile + date of birth (or UHID). Max 5 failed tries per mobile per 15 min. */
export async function selfCheckIn(db:Db,code:string,key:string,b:any){const h=await hosp(db,code,key);let mobile:string|null=null;try{mobile=normalizeMobile(b.mobile)}catch{};if(!mobile)throw new HttpError(400,'Enter your 10-digit mobile number.')
 const fails=(await db.query("select count(*)::int n from self_checkin_attempts where hospital_id=$1 and mobile=$2 and not ok and created_at>now()-interval '15 minutes'",[h.id,mobile])).rows[0].n;if(fails>=5)throw new HttpError(429,'Too many attempts. Please go to reception.')
 const dob=String(b.dob||'').trim(),uhid=String(b.uhid||'').trim().toUpperCase();if(!dob&&!uhid)throw new HttpError(400,'Enter your date of birth or UHID.')
 const p=(await db.query("select id,full_name,uhid from patients where hospital_id=$1 and mobile=$2 and (($3<>'' and date_of_birth=nullif($3,'')::date) or ($4<>'' and upper(uhid)=$4)) limit 1",[h.id,mobile,/^\d{4}-\d{2}-\d{2}$/.test(dob)?dob:'',uhid])).rows[0]
 await db.query('insert into self_checkin_attempts(hospital_id,mobile,ok) values($1,$2,$3)',[h.id,mobile,!!p]);if(!p)throw new HttpError(404,'We could not find your record with those details. Please go to reception — new patients register there.')
 const ctx=await systemCtx(db,h.id);const day=today()
 const q=(await db.query("select q.token_no,u.full_name doctor from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.patient_id=$2 and q.visit_date=$3 and q.status<>'checked' order by q.checked_in_at desc limit 1",[h.id,p.id,day])).rows[0];if(q)return {already:true,token:q.token_no,doctor:q.doctor,firstName:p.full_name.split(' ')[0]}
 const ap=(await db.query("select id,doctor_user_id from appointments where hospital_id=$1 and patient_id=$2 and status in ('scheduled','confirmed') and scheduled_at>=$3 and scheduled_at<$4 order by scheduled_at limit 1",[h.id,p.id,istToUtc(day,0),istToUtc(day,1440)])).rows[0]
 const doctorId=ap?.doctor_user_id||b.doctorId;if(!doctorId)return {needDoctor:true,firstName:p.full_name.split(' ')[0]}
 if(!ap){const st=(await doctorStatuses(db,h.id)).find(x=>x.id===doctorId);if(!st)throw new HttpError(404,'Doctor not found.');if(st.status==='on_leave'||!st.online)throw new HttpError(409,'This doctor is not available today. Please choose another doctor or ask at reception.')}
 const r=await checkIn(db,ctx,{patientId:p.id,doctorId,appointmentId:ap?.id||null});await audit(db,ctx,'self_check_in','queue',r.id,{via:'qr',token:r.token_no,appointment:!!ap})
 const ahead=(await db.query("select count(*)::int n from doctor_queue where hospital_id=$1 and doctor_user_id=$2 and visit_date=$3 and status in ('waiting','called') and token_no<$4",[h.id,doctorId,day,r.token_no])).rows[0].n
 return {token:r.token_no,doctor:r.doctor,ahead,firstName:p.full_name.split(' ')[0],appointment:!!ap}}
export async function selfServiceSettings(db:Db,ctx:Ctx,b?:any){if(b){if(ctx.role!=='admin')throw new HttpError(403,'Only admin can change this.');if(b.rotateKey)await db.query("update hospitals set checkin_key=encode(gen_random_bytes(12),'hex') where id=$1",[ctx.hospitalId]);await db.query('update hospitals set self_checkin_enabled=coalesce($2,self_checkin_enabled),whatsapp_booking_enabled=coalesce($3,whatsapp_booking_enabled) where id=$1',[ctx.hospitalId,b.selfCheckin??null,b.whatsappBooking??null]);await audit(db,ctx,'self_service_settings','hospital',ctx.hospitalId,{selfCheckin:b.selfCheckin,whatsappBooking:b.whatsappBooking,rotated:!!b.rotateKey})}
 const h=(await db.query('select code,self_checkin_enabled,checkin_key,whatsapp_booking_enabled from hospitals where id=$1',[ctx.hospitalId])).rows[0];return {selfCheckin:h.self_checkin_enabled,whatsappBooking:h.whatsapp_booking_enabled,code:h.code,key:ctx.role==='admin'||ctx.role==='reception'?h.checkin_key:null}}
const fmt=(d:Date)=>d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})
/** WhatsApp "BOOK": offers next 3 free slots with the patient's usual doctor; tapping one books it (patient-initiated, so it is a real booking). */
export async function whatsappBook(db:Db,pats:{id:string;hospital_id:string}[],text:string,payload:string,now=new Date()):Promise<string[]>{
 const m=payload.match(/^BK:([0-9a-f-]{36}):(\d+)$/i)
 for(const p of pats){const h=(await db.query('select whatsapp_booking_enabled,opd_hours,name from hospitals where id=$1',[p.hospital_id])).rows[0];if(!h?.whatsapp_booking_enabled)continue
  if(m){const at=new Date(Number(m[2])*60000);const d=(await db.query("select id,full_name from users where id=$1 and hospital_id=$2 and role='doctor' and active",[m[1],p.hospital_id])).rows[0];if(!d)return ['book: doctor not found']
   const ok=(await freeSlots(db,p.hospital_id,d.id,new Date(at.getTime()+330*60000).toISOString().slice(0,10),h.opd_hours||{},null,now,200)).some(s=>s.getTime()===at.getTime())
   if(!ok){await enqueue(db,{hospitalId:p.hospital_id,patientId:p.id,kind:'booking',body:`Sorry, that slot was just taken. Reply BOOK to see new times.`});return ['book: slot gone']}
   const a=(await db.query("insert into appointments(hospital_id,patient_id,doctor_user_id,scheduled_at,status) values($1,$2,$3,$4,'scheduled') on conflict do nothing returning id",[p.hospital_id,p.id,d.id,at])).rows[0];if(!a)return ['book: conflict']
   await db.query("insert into audit_log(hospital_id,action,entity,entity_id,details) values($1,'whatsapp_booking','appointment',$2,$3)",[p.hospital_id,a.id,JSON.stringify({via:'whatsapp'})])
   await enqueue(db,{hospitalId:p.hospital_id,patientId:p.id,kind:'booking',body:`Booked: ${d.full_name}, ${fmt(at)} at ${h.name}. On arrival, scan the check-in QR at reception.`,dedupe:'bk:'+a.id});return ['booked']}
  const doc=(await db.query("select u.id,u.full_name from patient_assignments a join users u on u.id=a.doctor_user_id where a.patient_id=$1 and u.active order by a.created_at desc limit 1",[p.id]).catch(()=>({rows:[]}))).rows[0]||(await db.query("select id,full_name from users where hospital_id=$1 and role='doctor' and active order by created_at limit 1",[p.hospital_id])).rows[0];if(!doc)return ['book: no doctor']
  let slots:Date[]=[];for(let i=0;i<7&&!slots.length;i++){const day=new Date(now.getTime()+330*60000+i*864e5).toISOString().slice(0,10);slots=await freeSlots(db,p.hospital_id,doc.id,day,h.opd_hours||{},null,now,3)}
  if(!slots.length){await enqueue(db,{hospitalId:p.hospital_id,patientId:p.id,kind:'booking',body:'No free slots in the next 7 days. Please call reception.'});return ['book: none']}
  await enqueue(db,{hospitalId:p.hospital_id,patientId:p.id,kind:'booking',body:`Choose a time with ${doc.full_name}:`,buttons:slots.map(s=>({id:`BK:${doc.id}:${Math.round(s.getTime()/60000)}`,title:fmt(s).slice(0,20)}))});return ['book: offered '+slots.length]}
 return ['book: not enabled']}
