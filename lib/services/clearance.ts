/** Patient clearance ("no dues"). Each department the patient touched confirms the patient is clear; billing then issues the
 *  clearance with its own number (gate pass / discharge clearance). Checks are computed live, so a department that signed
 *  and then gets new work (a new order, a new prescription) shows as "re-opened" until it signs again.
 *  Departments the patient never used are "not involved" and need no sign-off. */
import {Ctx,Db,HttpError,Role,assertPatient,audit,nextCounter,opt,requireRole,uhidPrefix} from './core';import {unbilledCharges,autoBill} from './flows';import {invoiceTotals} from './billing'
export type DeptKey='opd'|'lab'|'radiology'|'pharmacy'|'ipd'|'billing'
export const DEPTS:{key:DeptKey;label:string;roles:Role[]}[]=[
 {key:'opd',label:'Consultation (OPD)',roles:['doctor']},
 {key:'lab',label:'Laboratory',roles:['lab']},
 {key:'radiology',label:'Radiology',roles:['lab']},
 {key:'pharmacy',label:'Pharmacy',roles:['pharmacy']},
 {key:'ipd',label:'Ward / IPD',roles:['nurse','doctor']},
 {key:'billing',label:'Billing (final)',roles:['billing','reception']}]
const STAFF:Role[]=['reception','doctor','nurse','lab','pharmacy','billing']
type Item={level:'ok'|'fail'|'info';text:string;link?:string}
const inr=(n:number)=>'₹'+n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
const can=(ctx:Ctx,roles:Role[])=>ctx.role==='admin'||roles.includes(ctx.role)
const IST_TODAY="(date_trunc('day',now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')"

/** Start of the care episode: the earlier of today (IST) and the active admission, so same-day OPD work before admission counts.
 *  Older open work (pending orders, undispensed prescriptions, dues) is always checked anyway. */
async function episodeStart(db:Db,hid:string,pid:string){const t=new Date((await db.query(`select ${IST_TODAY} t`)).rows[0].t);const a=(await db.query("select id,admitted_at from admissions where hospital_id=$1 and patient_id=$2 and status='admitted' limit 1",[hid,pid])).rows[0];if(a){const at=new Date(a.admitted_at);return {since:at<t?at:t,admissionId:a.id as string|null}}return {since:t,admissionId:null}}

async function deptChecks(db:Db,ctx:Ctx,pid:string,since:Date):Promise<Record<DeptKey,{involved:boolean;items:Item[]}>>{const h=ctx.hospitalId
 const [enc,q,ord,files,rx,adm,inv]=await Promise.all([
  db.query("select e.id,e.status,e.created_at,u.full_name doctor from encounters e join users u on u.id=e.doctor_user_id where e.hospital_id=$1 and e.patient_id=$2 and (e.status='open' or e.created_at>=$3)",[h,pid,since]),
  db.query("select q.token_no,q.status,u.full_name doctor from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.patient_id=$2 and q.status in ('waiting','consultation') and q.visit_date>=(now() at time zone 'Asia/Kolkata')::date",[h,pid]),
  db.query("select id,test_name,category,status,ordered_at from diagnostic_orders where hospital_id=$1 and patient_id=$2 and (status in ('ordered','sample_collected') or ordered_at>=$3)",[h,pid,since]),
  db.query("select f.title,o.category from report_files f join diagnostic_orders o on o.id=f.order_id where f.hospital_id=$1 and f.patient_id=$2 and f.verified_at is null",[h,pid]),
  db.query("select pr.id,pr.status,pr.created_at,u.full_name doctor,(select count(*)::int from prescription_items i where i.prescription_id=pr.id) n from prescriptions pr join users u on u.id=pr.doctor_user_id where pr.hospital_id=$1 and pr.patient_id=$2 and (pr.status='pending' or pr.created_at>=$3)",[h,pid,since]),
  db.query("select a.admission_no,a.status,a.admitted_at,a.discharged_at,b.ward,b.bed_no from admissions a join beds b on b.id=a.bed_id where a.hospital_id=$1 and a.patient_id=$2 and (a.status='admitted' or a.discharged_at>=$3)",[h,pid,since]),
  db.query("select id,invoice_no from invoices where hospital_id=$1 and patient_id=$2 and status in ('open','partially_paid') order by created_at",[h,pid])])
 const out={} as Record<DeptKey,{involved:boolean;items:Item[]}>
 // OPD
 {const items:Item[]=[];for(const e of enc.rows)if(e.status==='open')items.push({level:'fail',text:`Consultation with ${e.doctor} is still open`,link:'/opd'})
  for(const t of q.rows)items.push({level:'fail',text:`Token #${t.token_no} is ${t.status==='waiting'?'waiting for':'with'} ${t.doctor}`,link:'/opd'})
  if(!items.length&&enc.rows.length)items.push({level:'ok',text:`${enc.rows.length} consultation${enc.rows.length>1?'s':''} finished`})
  out.opd={involved:enc.rows.length>0||q.rows.length>0,items}}
 // Lab and radiology
 for(const cat of ['lab','radiology'] as const){const os=ord.rows.filter((o:any)=>o.category===cat),items:Item[]=[]
  for(const o of os)if(o.status==='ordered')items.push({level:'fail',text:`${o.test_name}: ${cat==='lab'?'sample not collected':'report not entered'}`,link:'/laboratory'});else if(o.status==='sample_collected')items.push({level:'fail',text:`${o.test_name}: result pending`,link:'/laboratory'})
  for(const f of files.rows.filter((f:any)=>f.category===cat))items.push({level:'fail',text:`Report file "${f.title}" not verified`,link:'/laboratory'})
  if(!items.length&&os.length)items.push({level:'ok',text:`${os.length} test${os.length>1?'s':''} reported`})
  out[cat]={involved:os.length>0,items}}
 // Pharmacy
 {const items:Item[]=[];for(const r of rx.rows)if(r.status==='pending')items.push({level:'fail',text:`Prescription by ${r.doctor} (${r.n} medicine${r.n===1?'':'s'}) not dispensed`,link:'/pharmacy'})
  if(!items.length&&rx.rows.length)items.push({level:'ok',text:`${rx.rows.length} prescription${rx.rows.length>1?'s':''} closed`})
  out.pharmacy={involved:rx.rows.length>0,items}}
 // Ward / IPD: the ward confirms returns and nursing handover; the stay itself is information, its bed charges are billing's check.
 {const items:Item[]=adm.rows.map((a:any)=>({level:'info' as const,text:a.status==='admitted'?`Admitted in ${a.ward} ${a.bed_no} (${a.admission_no}). Record the discharge after clearance.`:`Discharged from ${a.ward} ${a.bed_no} (${a.admission_no})`}))
  out.ipd={involved:adm.rows.length>0,items}}
 // Billing: nothing unbilled, no balance on any bill.
 {const items:Item[]=[];const un=await unbilledCharges(db,{...ctx,role:'admin'},pid);const unSum=un.reduce((s:number,c:any)=>s+c.unitPrice*(c.quantity||1),0)
  if(un.length)items.push({level:'fail',text:`${un.length} charge${un.length>1?'s':''} not billed yet (${inr(unSum)})`,link:'/billing?patient='+pid})
  let bal=0;for(const i of inv.rows){const t=await invoiceTotals(db,i.id);if(t.balance>0.001){bal+=t.balance;items.push({level:'fail',text:`${i.invoice_no}: balance ${inr(t.balance)}`,link:'/billing?patient='+pid})}}
  if(!items.length)items.push({level:'ok',text:'No dues: everything is billed and paid'})
  out.billing={involved:true,items}}
 return out}

async function openClearance(db:Db,hid:string,pid:string){return (await db.query("select * from patient_clearances where hospital_id=$1 and patient_id=$2 and status='open'",[hid,pid])).rows[0]||null}

/** Full checklist for one patient: department status, open items, sign-offs, and whether billing can issue the clearance. */
export async function clearanceView(db:Db,ctx:Ctx,patientId:string){requireRole(ctx,STAFF);const p=await assertPatient(db,ctx,patientId)
 const open=await openClearance(db,ctx.hospitalId,p.id);const last=open?null:(await db.query("select c.*,u.full_name cleared_by_name from patient_clearances c left join users u on u.id=c.cleared_by where c.hospital_id=$1 and c.patient_id=$2 and c.status='cleared' order by c.cleared_at desc limit 1",[ctx.hospitalId,p.id])).rows[0]||null
 const ep=open?{since:new Date(open.since),admissionId:open.admission_id}:await episodeStart(db,ctx.hospitalId,p.id)
 const checks=await deptChecks(db,ctx,p.id,ep.since)
 const signs=open?(await db.query('select s.*,u.full_name signed_by_name from clearance_signoffs s left join users u on u.id=s.signed_by where s.clearance_id=$1',[open.id])).rows:[]
 const departments=DEPTS.map(d=>{const c=checks[d.key],s=signs.find((x:any)=>x.department===d.key),fails=c.items.filter(i=>i.level==='fail').length
  const status:'not_involved'|'pending'|'ready'|'signed'|'hold'|'reopened'=s?.status==='hold'?'hold':s?(fails&&!s.with_open_items?'reopened':'signed'):!c.involved?'not_involved':fails?'pending':'ready'
  return {key:d.key,label:d.label,roles:d.roles,involved:c.involved||!!s,status,items:c.items,openItems:fails,signoff:s?{status:s.status,note:s.note,by:s.signed_by_name,at:s.signed_at,withOpenItems:s.with_open_items}:null,canSign:!!open&&d.key!=='billing'&&can(ctx,d.roles)&&(c.involved||!!s)}})
 const blockers:string[]=[];for(const d of departments){if(d.key==='billing'){if(d.openItems)blockers.push('Billing: clear the dues');continue}if(d.status==='pending'||d.status==='ready')blockers.push(`${d.label}: waiting for sign-off`);else if(d.status==='reopened')blockers.push(`${d.label}: new work after sign-off, sign again`);else if(d.status==='hold')blockers.push(`${d.label}: on hold${d.signoff?.note?' ('+d.signoff.note+')':''}`)}
 const done=departments.filter(d=>d.involved&&d.key!=='billing'&&d.status==='signed').length,needed=departments.filter(d=>d.involved&&d.key!=='billing').length
 return {patient:{id:p.id,uhid:p.uhid,full_name:p.full_name},clearance:open?{id:open.id,status:'open',requestedAt:open.requested_at,since:open.since,note:open.note}:null,lastCleared:last?{clearanceNo:last.clearance_no,at:last.cleared_at,by:last.cleared_by_name}:null,
  departments,progress:{done,needed},blockers,canRequest:!open,canFinalize:!!open&&!blockers.length&&can(ctx,['billing','reception']),role:ctx.role}}

/** Start the clearance (any staff). Departments see the patient in their "waiting for you" list. */
export async function requestClearance(db:Db,ctx:Ctx,patientId:string,b:any={}){requireRole(ctx,STAFF);const p=await assertPatient(db,ctx,patientId);if(await openClearance(db,ctx.hospitalId,p.id))return clearanceView(db,ctx,p.id)
 const ep=await episodeStart(db,ctx.hospitalId,p.id);try{const r=(await db.query('insert into patient_clearances(hospital_id,patient_id,admission_id,since,note,requested_by) values($1,$2,$3,$4,$5,$6) returning id',[ctx.hospitalId,p.id,ep.admissionId,ep.since,opt(b.note),ctx.userId])).rows[0];await audit(db,ctx,'clearance_request','patient_clearance',r.id,{patientId:p.id})}catch(e:any){if(e?.code!=='23505')throw e}
 return clearanceView(db,ctx,p.id)}

/** A department confirms the patient is clear (or puts the clearance on hold with a reason).
 *  With open items the signer must write why (e.g. "patient will buy medicines outside"); that note is kept on the record. */
export async function signDepartment(db:Db,ctx:Ctx,patientId:string,dept:string,b:any={}){const d=DEPTS.find(x=>x.key===dept);if(!d||d.key==='billing')throw new HttpError(400,'Unknown department.');requireRole(ctx,d.roles)
 let open=await openClearance(db,ctx.hospitalId,patientId);if(!open){await requestClearance(db,ctx,patientId);open=await openClearance(db,ctx.hospitalId,patientId)}
 const v=await clearanceView(db,ctx,patientId);const dv=v.departments.find(x=>x.key===d.key)!;const note=opt(b.note);const hold=!!b.hold
 if(!dv.involved)throw new HttpError(409,`${d.label} is not involved for this patient. No sign-off needed.`)
 if(hold&&!note)throw new HttpError(400,'Write why the clearance is on hold.')
 if(!hold&&dv.openItems&&!note)throw new HttpError(409,`${dv.openItems} open item${dv.openItems>1?'s':''} in ${d.label}: ${dv.items.filter(i=>i.level==='fail').map(i=>i.text).join('; ')}. Finish them, or write a note to clear anyway.`)
 await db.query(`insert into clearance_signoffs(clearance_id,hospital_id,department,status,note,with_open_items,signed_by) values($1,$2,$3,$4,$5,$6,$7)
  on conflict(clearance_id,department) do update set status=excluded.status,note=excluded.note,with_open_items=excluded.with_open_items,signed_by=excluded.signed_by,signed_at=now()`,[open.id,ctx.hospitalId,d.key,hold?'hold':'cleared',note,!hold&&dv.openItems>0,ctx.userId])
 await audit(db,ctx,hold?'clearance_hold':'clearance_sign','patient_clearance',open.id,{department:d.key,openItems:dv.openItems,note})
 return clearanceView(db,ctx,patientId)}

/** Billing issues the clearance once every involved department has signed and there are no dues. */
export async function finalizeClearance(db:Db,ctx:Ctx,patientId:string){requireRole(ctx,['billing','reception']);const v=await clearanceView(db,ctx,patientId);if(!v.clearance)throw new HttpError(409,'Start the clearance first.');if(v.blockers.length)throw new HttpError(409,'Not ready: '+v.blockers.join(' · '))
 const y=new Date().getFullYear().toString();const no=`${await uhidPrefix(db,ctx.hospitalId)}/CLR/${y}/${String(await nextCounter(db,ctx.hospitalId,'clearance',y)).padStart(6,'0')}`
 await db.query("insert into clearance_signoffs(clearance_id,hospital_id,department,status,signed_by) values($1,$2,'billing','cleared',$3) on conflict(clearance_id,department) do update set status='cleared',signed_by=$3,signed_at=now()",[v.clearance.id,ctx.hospitalId,ctx.userId])
 const r=(await db.query("update patient_clearances set status='cleared',clearance_no=$3,cleared_by=$4,cleared_at=now(),snapshot=$5 where id=$1 and hospital_id=$2 and status='open' returning id",[v.clearance.id,ctx.hospitalId,no,ctx.userId,JSON.stringify(v.departments.map(d=>({key:d.key,status:d.status,signoff:d.signoff})))])).rows[0];if(!r)throw new HttpError(409,'Clearance was already closed.')
 await audit(db,ctx,'clearance_issued','patient_clearance',v.clearance.id,{no});return {...await clearanceView(db,ctx,patientId),issued:no}}

export async function cancelClearance(db:Db,ctx:Ctx,patientId:string){requireRole(ctx,['billing','reception']);const open=await openClearance(db,ctx.hospitalId,patientId);if(!open)throw new HttpError(404,'No open clearance.');await db.query("update patient_clearances set status='cancelled' where id=$1",[open.id]);await audit(db,ctx,'clearance_cancel','patient_clearance',open.id);return clearanceView(db,ctx,patientId)}

/** Billing shortcut inside the checklist: bill every pending charge for the patient in one click. */
export async function billPending(db:Db,ctx:Ctx,patientId:string){requireRole(ctx,['billing','reception']);await autoBill(db,ctx,patientId);return clearanceView(db,ctx,patientId)}

/** Open clearances, with the department statuses. mine=true: only patients waiting for the caller's department. */
export async function clearanceWorklist(db:Db,ctx:Ctx,mine=false){requireRole(ctx,STAFF);const rows=(await db.query("select c.patient_id,c.requested_at,u.full_name requested_by from patient_clearances c left join users u on u.id=c.requested_by where c.hospital_id=$1 and c.status='open' order by c.requested_at",[ctx.hospitalId])).rows
 const out:any[]=[];for(const r of rows){const v=await clearanceView(db,ctx,r.patient_id);const waitingForMe=v.departments.filter(d=>d.canSign&&['pending','ready','reopened'].includes(d.status)).map(d=>d.key);const billingReady=v.canFinalize
  if(mine&&!waitingForMe.length&&!billingReady)continue
  out.push({patient:v.patient,requestedAt:r.requested_at,requestedBy:r.requested_by,progress:v.progress,departments:v.departments.filter(d=>d.involved).map(d=>({key:d.key,label:d.label,status:d.status,openItems:d.openItems})),waitingForMe,readyToIssue:billingReady,blockers:v.blockers})}
 return out}

/** One click for a department: sign every waiting patient whose checks are all clear (nothing open). */
export async function signAllReady(db:Db,ctx:Ctx,dept:string){const d=DEPTS.find(x=>x.key===dept);if(!d||d.key==='billing')throw new HttpError(400,'Unknown department.');requireRole(ctx,d.roles);let n=0
 for(const w of await clearanceWorklist(db,ctx)){const dv=w.departments.find((x:any)=>x.key===d.key);if(dv&&dv.status==='ready'){await signDepartment(db,ctx,w.patient.id,d.key);n++}}
 return {signed:n}}
