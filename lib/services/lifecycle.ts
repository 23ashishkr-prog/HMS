/** Subscription lifecycle: trial (TRIAL_DAYS, default 30) → on_hold (read-only renew screen) → purge after HOLD_MONTHS,
 *  keeping only a minimal patient register (name, phone, address). Idempotent: safe to run any number of times. */
import {Db,HttpError} from './core';import {tx} from './auth'
import {TRIAL_DAYS} from '../plans'
export {TRIAL_DAYS}
/** @deprecated use TRIAL_DAYS; kept so old env TRIAL_MONTHS still roughly works if set alone. */
export const TRIAL_MONTHS=()=>{const d=process.env.TRIAL_DAYS;if(d)return Math.max(1,Math.round(Number(d)/30));return Number(process.env.TRIAL_MONTHS||1)}
export const HOLD_MONTHS=()=>Number(process.env.HOLD_MONTHS||6)
export const WARN_DAYS=[30,7,1]
const addMonths=(d:Date,m:number)=>{const x=new Date(d);x.setMonth(x.getMonth()+m);return x}
const DAY=86400000
export function purgeAt(s:any){if(!s.hold_started_at)return null;const p=addMonths(new Date(s.hold_started_at),HOLD_MONTHS());const e=s.hold_extended_until?new Date(s.hold_extended_until):null;return e&&e>p?e:p}
export function lifecycleView(s:any,now=new Date()){if(!s)return null;const st=s.status;const trialEnd=s.trial_ends_at?new Date(s.trial_ends_at):null;const pAt=purgeAt(s)
 const onHold=st==='on_hold'||(st==='trialing'&&!!trialEnd&&trialEnd<=now)||['past_due','cancelled','expired'].includes(st)
 const daysLeft=st==='trialing'&&trialEnd&&!onHold?Math.ceil((trialEnd.getTime()-now.getTime())/DAY):null
 const daysToPurge=onHold&&pAt&&!s.purged_at?Math.max(0,Math.ceil((pAt.getTime()-now.getTime())/DAY)):null
 return {status:onHold?'on_hold':st,onHold,trialEndsAt:trialEnd,trialDaysLeft:daysLeft,holdStartedAt:s.hold_started_at,purgeAt:pAt,daysToPurge,purgedAt:s.purged_at}}
const emailConfigured=()=>!!(process.env.RESEND_API_KEY||process.env.SMTP_URL)
async function notice(db:Db,h:string,kind:string,days:number,cycle:Date){const r=await db.query('insert into lifecycle_notices(hospital_id,kind,days_left,channel,cycle_start) values($1,$2,$3,$4,$5) on conflict do nothing returning id',[h,kind,days,emailConfigured()?'in_app+email':'in_app',cycle]);return r.rows.length}
/** Delete all clinical/financial data; keep hospital, primary admin, and patients(uhid, full_name, mobile, address). */
export async function purgeHospital(db:Db,h:string){
 const del=['medicine_adherence','notification_outbox','followup_offers','idempotency_keys','insurance_claims','payments','invoice_items:invoice_id in (select id from invoices where hospital_id=$1)','invoices','diagnoses','vitals','diagnostic_orders','dispensed_items','prescription_items:prescription_id in (select id from prescriptions where hospital_id=$1)','prescriptions','clinical_notes','encounters','lab_reports','doctor_queue','appointments','patient_assignments','admissions','beds','medicine_batches','medicines','service_catalog','doctor_availability','doctor_time_off','audit_log','hospital_counters']
 for(const d of del){const [t,w]=d.split(':');await db.query(`delete from ${t} where ${w||'hospital_id=$1'}`,[h])}
 await db.query('update patients set gender=null,date_of_birth=null,blood_group=null,abha_number=null,abha_address=null,email=null,city=null,state=null,pincode=null,id_proof_type=null,id_proof_number=null,emergency_contact_name=null,emergency_contact_phone=null,allergies=null,registered_by=null,updated_at=now() where hospital_id=$1',[h])
 const admin=(await db.query("select id from users where hospital_id=$1 and role='admin' order by created_at limit 1",[h])).rows[0]
 await db.query('update users set active=false,updated_at=now() where hospital_id=$1 and id<>$2',[h,admin?.id||'00000000-0000-0000-0000-000000000000'])
 await db.query("update subscriptions set purged_at=now(),updated_at=now() where hospital_id=$1",[h])}
export async function runLifecycle(db:Db,now=new Date()){const out={held:0,purged:0,notices:0}
 const subs=(await db.query("select s.* from subscriptions s join hospitals h on h.id=s.hospital_id where coalesce(h.status,'active')='active'")).rows
 for(const s of subs){const v=lifecycleView(s,now)!
  if(v.onHold&&!s.hold_started_at){await db.query("update subscriptions set status='on_hold',hold_started_at=$2,updated_at=now() where hospital_id=$1 and hold_started_at is null",[s.hospital_id,now]);s.hold_started_at=now;s.status='on_hold';out.held++;out.notices+=await notice(db,s.hospital_id,'on_hold',0,now)}
  if(s.status==='trialing'&&v.trialDaysLeft!=null)for(const d of WARN_DAYS)if(v.trialDaysLeft<=d)out.notices+=await notice(db,s.hospital_id,'trial_ending',d,new Date(s.trial_ends_at))
  if(s.status==='on_hold'&&!s.purged_at){const p=purgeAt(s)!;const left=Math.ceil((p.getTime()-now.getTime())/DAY);for(const d of WARN_DAYS)if(left<=d&&left>0)out.notices+=await notice(db,s.hospital_id,'purge_pending',d,new Date(s.hold_started_at));if(p<=now){await tx(db,d=>purgeHospital(d,s.hospital_id));out.purged++;out.notices+=await notice(db,s.hospital_id,'purged',0,new Date(s.hold_started_at))}}}
 return out}
export async function activeNotices(db:Db,h:string){return (await db.query('select kind,days_left,created_at from lifecycle_notices where hospital_id=$1 and dismissed_at is null order by created_at desc limit 5',[h])).rows}
export async function platformExtend(db:Db,h:string,b:any){const days=Number(b.days);if(!Number.isFinite(days)||days<1||days>730)throw new HttpError(400,'days must be 1-730');const s=(await db.query('select * from subscriptions where hospital_id=$1',[h])).rows[0];if(!s)throw new HttpError(404,'Hospital not found')
 if(b.what==='trial'){await db.query("update subscriptions set status='trialing',trial_ends_at=greatest(coalesce(trial_ends_at,now()),now())+make_interval(days=>$2::int),hold_started_at=null,hold_extended_until=null,updated_at=now() where hospital_id=$1",[h,days])}
 else if(b.what==='hold'){const base=purgeAt(s)||new Date();await db.query('update subscriptions set hold_extended_until=$2,updated_at=now() where hospital_id=$1',[h,new Date(Math.max(base.getTime(),Date.now())+days*DAY)])}
 else throw new HttpError(400,'what must be trial or hold')}
export async function platformSetHospitalStatus(db:Db,h:string,status:string){if(!['active','deactivated'].includes(status))throw new HttpError(400,'Invalid status');const r=await db.query('update hospitals set status=$2,updated_at=now() where id=$1 returning id',[h,status]);if(!r.rows[0])throw new HttpError(404,'Hospital not found')}
