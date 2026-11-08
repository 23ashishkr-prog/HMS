/** PM-JAY (Ayushman Bharat) and other schemes: HBP package master, scheme on the admission, cashless package billing,
 *  pre-authorisation (draft → submitted → queried → approved/rejected, plus enhancements) with an event trail, and scheme claims.
 *  Package billing: the stay is billed to the scheme at the package rate; every itemised line stays on the patient's bill for the
 *  record at ₹0 (its price is kept in record_price, see migration 056), so the patient owes nothing and discharge is not held for payment. */
import {Ctx,Db,HttpError,assertPatient,audit,num,opt,required,requireRole} from './core'
import {autoBill} from './flows';import {invoiceTotals} from './billing';import {claimPacket} from './claimpacket';import {updateClaim} from './insurance'
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib'
const R=['admin','billing'] as const
const VIEW=['admin','billing','reception','doctor','nurse'] as const
export const SCHEMES:{code:string;label:string;package:boolean}[]=[{code:'PMJAY',label:'PM-JAY (Ayushman Bharat)',package:true},{code:'STATE',label:'State health scheme',package:true},{code:'CGHS',label:'CGHS',package:false},{code:'ECHS',label:'ECHS',package:false},{code:'PRIVATE',label:'Private insurer / TPA',package:false}]
const isPkgScheme=(s:any)=>SCHEMES.some(x=>x.code===s&&x.package)
const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
// ---------- package master ----------
/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text:string):string[][]{const out:string[][]=[];let row:string[]=[],cell='',q=false;const s=String(text||'').replace(/^﻿/,'')
 for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))out.push(row);row=[]}else cell+=c}
 row.push(cell);if(row.some(x=>x.trim()))out.push(row);return out}
const COLS:Record<string,string[]>={code:['code','package code','procedure code','hbp code','package_code'],specialty:['specialty','speciality','specialty name','speciality name'],name:['name','package name','procedure name','procedure','package_name'],rate:['rate','package rate','price','amount','package_rate','rate (rs)','rate (inr)'],pre:['pre_auth_required','pre-auth required','preauth required','pre auth','preauth','pre-auth'],implant:['implant_allowed','implant','implants','implant allowed'],los:['los_days','los','alos','length of stay','los (days)']}
const yes=(v:any,d:boolean)=>{const s=String(v??'').trim().toLowerCase();if(!s)return d;return ['y','yes','true','1','required','mandatory'].includes(s)}
/** Import the HBP package master (NHA CSV export or our template). Upserts by code; returns counts and per-line errors. */
export async function importPackages(db:Db,ctx:Ctx,csv:string){requireRole(ctx,[...R]);const rows=parseCsv(csv);if(rows.length<2)throw new HttpError(400,'The CSV needs a header row and at least one package.')
 const head=rows[0].map(h=>h.trim().toLowerCase());const idx:Record<string,number>={};for(const [k,names] of Object.entries(COLS))idx[k]=head.findIndex(h=>names.includes(h))
 if(idx.code<0||idx.name<0||idx.rate<0)throw new HttpError(400,'The CSV needs columns for package code, package name and rate.')
 let inserted=0,updated=0;const errors:{line:number;error:string}[]=[]
 for(let i=1;i<rows.length;i++){const r=rows[i],g=(k:string)=>idx[k]>=0?String(r[idx[k]]??'').trim():'';const code=g('code').toUpperCase(),name=g('name'),rate=Number(g('rate').replace(/[₹,\s]|rs\.?/gi,''))
  if(!code||!name){errors.push({line:i+1,error:'Code and name are required'});continue}if(!Number.isFinite(rate)||rate<0){errors.push({line:i+1,error:'Rate is not a number'});continue}const los=parseInt(g('los'));
  const x=(await db.query('insert into hbp_packages(hospital_id,code,specialty,name,rate,pre_auth_required,implant_allowed,los_days) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(hospital_id,code) do update set specialty=excluded.specialty,name=excluded.name,rate=excluded.rate,pre_auth_required=excluded.pre_auth_required,implant_allowed=excluded.implant_allowed,los_days=excluded.los_days,active=true,updated_at=now() returning (xmax=0) ins',[ctx.hospitalId,code.slice(0,20),opt(g('specialty')),name.slice(0,500),rate,yes(g('pre'),true),yes(g('implant'),false),Number.isFinite(los)?los:null])).rows[0]
  if(x.ins)inserted++;else updated++}
 await audit(db,ctx,'hbp_import','hbp_package',null,{inserted,updated,errors:errors.length});return {inserted,updated,errors:errors.slice(0,50)}}
export async function listPackages(db:Db,ctx:Ctx,q='',specialty=''){requireRole(ctx,[...VIEW]);return (await db.query("select * from hbp_packages where hospital_id=$1 and active and ($2='' or code ilike $2||'%' or name ilike '%'||$2||'%') and ($3='' or specialty=$3) order by code limit 200",[ctx.hospitalId,q.trim(),specialty.trim()])).rows}
export async function specialties(db:Db,ctx:Ctx){requireRole(ctx,[...VIEW]);return (await db.query("select specialty,count(*)::int n from hbp_packages where hospital_id=$1 and active and specialty is not null group by 1 order by 1",[ctx.hospitalId])).rows}
/** Package lines with the HBP multiple-procedure rule: surgical packages (codes starting with S) ranked by rate are paid 100%, 50%, then 25%;
 *  medical and other packages are paid in full. */
export function packageLines(pkgs:{code:string;name?:string;rate:number;qty?:number}[]){const surg=pkgs.filter(p=>/^S/i.test(p.code)).sort((a,b)=>Number(b.rate)-Number(a.rate));const rank=new Map(surg.map((p,i)=>[p,i]))
 const lines=pkgs.map(p=>{const i=rank.get(p);const pct=i==null?100:i===0?100:i===1?50:25;const qty=Number(p.qty)||1;return {code:String(p.code).toUpperCase(),name:p.name||'',rate:Number(p.rate),qty,pct,amount:r2(Number(p.rate)*qty*pct/100)}})
 return {lines,total:r2(lines.reduce((s,l)=>s+l.amount,0))}}
async function resolvePackages(db:Db,hid:string,list:any[]){if(!Array.isArray(list)||!list.length)throw new HttpError(400,'Choose at least one package.');const out:any[]=[]
 for(const it of list){const code=String(typeof it==='string'?it:it?.code||'').trim().toUpperCase();const p=(await db.query('select * from hbp_packages where hospital_id=$1 and code=$2 and active',[hid,code])).rows[0];if(!p)throw new HttpError(404,`Package ${code||'(blank)'} is not in the package master.`);out.push({code:p.code,name:p.name,rate:Number(p.rate),qty:Number(it?.qty)||1,preAuth:p.pre_auth_required,implant:p.implant_allowed,los:p.los_days})}
 return out}
// ---------- scheme on admission ----------
async function admission(db:Db,ctx:Ctx,id:string){const a=(await db.query('select * from admissions where id=$1 and hospital_id=$2',[required(id,'Admission'),ctx.hospitalId])).rows[0];if(!a)throw new HttpError(404,'Admission not found.');return a}
/** Scheme picker on the admission (also remembered on the patient for next time). */
export async function setAdmissionScheme(db:Db,ctx:Ctx,admissionId:string,b:any){requireRole(ctx,['admin','reception','doctor','billing']);const a=await admission(db,ctx,admissionId);const scheme=opt(b.scheme)?.toUpperCase()||null
 if(scheme&&!SCHEMES.some(s=>s.code===scheme))throw new HttpError(400,'Unknown scheme.');const member=opt(b.memberId);if(scheme&&!member)throw new HttpError(400,scheme==='PMJAY'?'PM-JAY ID (or ABHA) is required.':'Card / policy number is required.')
 if(!scheme&&a.package_billing)throw new HttpError(409,'Remove the package bill first.')
 const ver=['verified','failed'].includes(b.verification)?b.verification:'unverified'
 const r=(await db.query('update admissions set scheme=$2,scheme_member_id=$3,scheme_payer=$4,scheme_verification=$5 where id=$1 returning *',[a.id,scheme,scheme?member:null,scheme?opt(b.payer):null,scheme?ver:'unverified'])).rows[0]
 if(scheme)await db.query("update patients set scheme=$2,scheme_member_id=$3,scheme_payer=$4,scheme_verification=$5,scheme_verified_at=case when $5='verified' then now() else scheme_verified_at end where id=$1",[a.patient_id,scheme,member,opt(b.payer),ver])
 await audit(db,ctx,'admission_scheme','admission',a.id,{scheme,verification:ver});return r}
export async function verifyBeneficiary(db:Db,ctx:Ctx,admissionId:string,b:any){requireRole(ctx,['admin','billing','reception']);const a=await admission(db,ctx,admissionId);if(!a.scheme)throw new HttpError(409,'Pick the scheme first.');const v=b.status;if(!['verified','failed','unverified'].includes(v))throw new HttpError(400,'Status must be verified, failed or unverified.')
 await db.query('update admissions set scheme_verification=$2 where id=$1',[a.id,v]);await db.query("update patients set scheme_verification=$2,scheme_verified_at=case when $2='verified' then now() else scheme_verified_at end where id=$1",[a.patient_id,v]);await audit(db,ctx,'beneficiary_'+v,'admission',a.id,{note:opt(b.note)});return {ok:true,verification:v}}
// ---------- package billing ----------
/** Bills the stay to the scheme at the package rate. Packages come from the approved pre-auth (and approved enhancements) or are named. */
export async function applyPackage(db:Db,ctx:Ctx,admissionId:string,b:any={}){requireRole(ctx,[...R]);const a=await admission(db,ctx,admissionId);if(a.status!=='admitted')throw new HttpError(409,'Only a current admission can be put on a package.');if(!isPkgScheme(a.scheme))throw new HttpError(409,'Package billing needs the admission under PM-JAY or a state scheme.')
 let list=b.packages||b.codes;if(!list?.length){const pa=(await db.query("select packages from preauth_requests where hospital_id=$1 and admission_id=$2 and status='approved' order by created_at",[ctx.hospitalId,a.id])).rows;list=pa.flatMap((x:any)=>x.packages||[])}
 const pk=await resolvePackages(db,ctx.hospitalId,list);const {lines,total}=packageLines(pk)
 await db.query('update admissions set package_billing=true,packages=$2,package_amount=$3 where id=$1',[a.id,JSON.stringify(lines.map((l,i)=>({...l,preAuth:pk[i].preAuth,implant:pk[i].implant,los:pk[i].los}))),total])
 const inv=(await db.query("update invoices set package_mode=true,admission_id=coalesce(admission_id,$3) where hospital_id=$1 and patient_id=$2 and status in ('open','partially_paid') and (admission_id=$3 or created_at>=$4) returning id",[ctx.hospitalId,a.patient_id,a.id,a.admitted_at])).rows
 for(const i of inv)await db.query('update invoice_items set record_price=coalesce(record_price,unit_price),unit_price=0 where invoice_id=$1 and unit_price>0',[i.id])
 try{await autoBill(db,{...ctx,role:'admin'},a.patient_id)}catch(e:any){if(e?.status!==409)throw e}
 const needPre=pk.filter(p=>p.preAuth).map(p=>p.code);const approved=(await db.query("select 1 from preauth_requests where admission_id=$1 and status='approved' and kind='initial'",[a.id])).rows[0]
 await audit(db,ctx,'package_apply','admission',a.id,{codes:lines.map(l=>l.code),total});return {...(await packageBill(db,ctx,a.id)),warning:needPre.length&&!approved?`Pre-authorisation is required for ${needPre.join(', ')} and is not approved yet.`:null}}
/** Back to normal itemised billing (wrong scheme, beneficiary not eligible). Restores the saved prices on open bills. */
export async function removePackage(db:Db,ctx:Ctx,admissionId:string){requireRole(ctx,[...R]);const a=await admission(db,ctx,admissionId);if(!a.package_billing)throw new HttpError(409,'This admission is not on a package.');if(a.status!=='admitted')throw new HttpError(409,'The patient is already discharged.')
 const inv=(await db.query("update invoices set package_mode=false where hospital_id=$1 and admission_id=$2 and package_mode and status in ('open','partially_paid') returning id",[ctx.hospitalId,a.id])).rows
 for(const i of inv)await db.query('update invoice_items set unit_price=record_price,record_price=null where invoice_id=$1 and record_price is not null',[i.id])
 await db.query("update admissions set package_billing=false,packages='[]',package_amount=null where id=$1",[a.id]);await audit(db,ctx,'package_remove','admission',a.id);return {ok:true}}
/** What the scheme is billed, what the itemised record adds up to, and what the patient owes (₹0 on a covered package). */
export async function packageBill(db:Db,ctx:Ctx,admissionId:string){requireRole(ctx,[...VIEW]);const a=await admission(db,ctx,admissionId)
 const inv=(await db.query("select id,invoice_no,status from invoices where hospital_id=$1 and admission_id=$2 and status<>'cancelled' order by created_at",[ctx.hospitalId,a.id])).rows
 const items=inv.length?(await db.query('select i.invoice_id,i.description,i.quantity::float quantity,i.unit_price::float unit_price,coalesce(i.record_price,i.unit_price)::float record_price,i.source_type from invoice_items i where i.invoice_id=any($1::uuid[]) order by i.created_at',[inv.map((x:any)=>x.id)])).rows:[]
 let gross=0,paid=0,balance=0;for(const i of inv){const t=await invoiceTotals(db,i.id);gross+=t.net;paid+=t.paid;balance+=t.balance}
 const pre=(await db.query("select id,kind,status,requested_amount,approved_amount,payer_ref from preauth_requests where hospital_id=$1 and admission_id=$2 order by created_at",[ctx.hospitalId,a.id])).rows
 const approved=r2(pre.filter((p:any)=>p.status==='approved').reduce((s:number,p:any)=>s+Number(p.approved_amount||0),0))
 return {admission:{id:a.id,no:a.admission_no,status:a.status,scheme:a.scheme,memberId:a.scheme_member_id,payer:a.scheme_payer,verification:a.scheme_verification,packageBilling:a.package_billing},
  packages:a.packages||[],schemeAmount:a.package_billing?Number(a.package_amount||0):0,preauthApproved:approved,preauths:pre,
  itemised:items.map((i:any)=>({description:i.description,quantity:i.quantity,recordPrice:i.record_price,billed:i.unit_price,amount:r2(i.quantity*i.record_price)})),itemisedTotal:r2(items.reduce((s:number,i:any)=>s+i.quantity*i.record_price,0)),
  patient:{billed:r2(gross),paid:r2(paid),balance:r2(balance),refundDue:a.package_billing?r2(paid):0}}}
// ---------- pre-authorisation ----------
export const PREAUTH_NEXT:Record<string,string[]>={draft:['submitted'],submitted:['queried','approved','rejected'],queried:['submitted','rejected'],approved:[],rejected:[]}
async function preauth(db:Db,ctx:Ctx,id:string){const p=(await db.query('select * from preauth_requests where id=$1 and hospital_id=$2',[required(id,'Pre-auth'),ctx.hospitalId])).rows[0];if(!p)throw new HttpError(404,'Pre-auth not found.');return p}
async function event(db:Db,ctx:Ctx,id:string,from:string|null,to:string,note?:string|null,amount?:number|null){await db.query('insert into preauth_events(hospital_id,preauth_id,from_status,to_status,note,amount,by_user) values($1,$2,$3,$4,$5,$6,$7)',[ctx.hospitalId,id,from,to,note||null,amount??null,ctx.userId]);await audit(db,ctx,'preauth:'+to,'preauth',id,{from,note:note||undefined,amount:amount??undefined})}
const docList=(d:any)=>(Array.isArray(d)?d:String(d||'').split('\n')).map((x:any)=>typeof x==='string'?{url:x.trim(),label:''}:{url:String(x?.url||'').trim(),label:String(x?.label||'').slice(0,120)}).filter((x:any)=>/^https?:\/\//i.test(x.url)).slice(0,30)
/** New pre-auth (draft). An enhancement needs an approved pre-auth on the same admission and asks only for the extra amount. */
export async function createPreauth(db:Db,ctx:Ctx,b:any){requireRole(ctx,[...R,'doctor']);let pid=b.patientId,adm:any=null,parent:any=null;const kind=b.kind==='enhancement'?'enhancement':'initial'
 if(kind==='enhancement'){parent=await preauth(db,ctx,b.parentId);if(parent.status!=='approved')throw new HttpError(409,'An enhancement needs an approved pre-auth.');if(parent.kind!=='initial')throw new HttpError(409,'Raise the enhancement on the original pre-auth.');pid=parent.patient_id;b.admissionId=parent.admission_id}
 const p=await assertPatient(db,ctx,pid);if(opt(b.admissionId)){adm=await admission(db,ctx,b.admissionId);if(adm.patient_id!==p.id)throw new HttpError(404,'Admission not found for this patient.')}
 const pk=await resolvePackages(db,ctx.hospitalId,b.packages||[]);const {lines,total}=packageLines(pk);const amt=num(b.requestedAmount,'Requested amount')??total
 const scheme=opt(b.scheme)?.toUpperCase()||parent?.scheme||adm?.scheme||'PMJAY';if(!SCHEMES.some(s=>s.code===scheme))throw new HttpError(400,'Unknown scheme.')
 const member=opt(b.memberId)||parent?.member_id||adm?.scheme_member_id;if(!member)throw new HttpError(400,'Beneficiary / card number is required.')
 const r=(await db.query('insert into preauth_requests(hospital_id,patient_id,admission_id,kind,parent_id,scheme,payer_name,member_id,packages,diagnosis,clinical_notes,documents,requested_amount,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *',
  [ctx.hospitalId,p.id,adm?.id||null,kind,parent?.id||null,scheme,opt(b.payerName)||parent?.payer_name||adm?.scheme_payer||null,member,JSON.stringify(lines),opt(b.diagnosis),opt(b.clinicalNotes),JSON.stringify(docList(b.documents)),amt,ctx.userId])).rows[0]
 await event(db,ctx,r.id,null,'draft',kind==='enhancement'?'Enhancement of '+parent.id:null,amt);return r}
/** Edit while draft or queried. */
export async function updatePreauth(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,[...R,'doctor']);const p=await preauth(db,ctx,id);if(!['draft','queried'].includes(p.status))throw new HttpError(409,'Only a draft or queried pre-auth can be edited.')
 let lines=p.packages,amt=p.requested_amount;if(b.packages){const x=packageLines(await resolvePackages(db,ctx.hospitalId,b.packages));lines=x.lines;amt=x.total}if(b.requestedAmount!=null&&b.requestedAmount!=='')amt=num(b.requestedAmount,'Requested amount')
 const r=(await db.query('update preauth_requests set packages=$2,requested_amount=$3,diagnosis=coalesce($4,diagnosis),clinical_notes=coalesce($5,clinical_notes),documents=coalesce($6,documents),updated_at=now() where id=$1 returning *',[id,JSON.stringify(lines),amt,opt(b.diagnosis),opt(b.clinicalNotes),b.documents!==undefined?JSON.stringify(docList(b.documents)):null])).rows[0]
 await audit(db,ctx,'preauth_edit','preauth',id);return r}
/** The state machine. submitted→queried needs the query, queried→submitted needs the reply, approved needs the amount. */
export async function movePreauth(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,[...R]);const p=await preauth(db,ctx,id);const to=required(b.status,'Status');if(!PREAUTH_NEXT[p.status]?.includes(to))throw new HttpError(409,`Cannot move pre-auth from ${p.status} to ${to}.`)
 let note:string|null=null,amt:number|null=null;const set:string[]=['status=$2','updated_at=now()'];const vals:any[]=[id,to]
 const add=(c:string,v:any)=>{vals.push(v);set.push(`${c}=$${vals.length}`)}
 if(to==='submitted'){if(p.status==='draft'){const docs=(p.documents||[]).length;if(!p.clinical_notes)throw new HttpError(400,'Add clinical notes before submitting.');add('submitted_at',new Date());note=docs?`${docs} document(s)`:null}else{note=required(b.reply,'Reply to the query');add('query_reply',note)}}
 if(to==='queried'){note=required(b.query,'Query text');add('query_text',note)}
 if(to==='approved'){amt=num(b.approvedAmount,'Approved amount',{allowNull:false});if(amt!>Number(p.requested_amount)+0.001)throw new HttpError(400,'Approved amount cannot be more than requested.');add('approved_amount',amt);add('decided_at',new Date());if(opt(b.payerRef))add('payer_ref',opt(b.payerRef));note=opt(b.note)}
 if(to==='rejected'){note=required(b.note,'Reason');add('decision_note',note);add('decided_at',new Date())}
 if(opt(b.payerRef)&&to!=='approved')add('payer_ref',opt(b.payerRef))
 const r=(await db.query(`update preauth_requests set ${set.join(',')} where id=$1 and status='${p.status}' returning *`,vals)).rows[0];if(!r)throw new HttpError(409,'Pre-auth changed meanwhile, reload.')
 await event(db,ctx,id,p.status,to,note,amt);return r}
export async function listPreauths(db:Db,ctx:Ctx,status=''){requireRole(ctx,[...R,'doctor']);return (await db.query("select r.*,p.full_name,p.uhid,a.admission_no,(select count(*)::int from preauth_requests e where e.parent_id=r.id) enhancements from preauth_requests r join patients p on p.id=r.patient_id left join admissions a on a.id=r.admission_id where r.hospital_id=$1 and ($2='' or r.status=$2) order by r.updated_at desc limit 200",[ctx.hospitalId,status])).rows}
export async function getPreauth(db:Db,ctx:Ctx,id:string){requireRole(ctx,[...R,'doctor']);const p=await preauth(db,ctx,id);const [ev,enh,pt]=await Promise.all([db.query('select e.*,u.full_name by_name from preauth_events e left join users u on u.id=e.by_user where e.preauth_id=$1 order by e.at',[id]),db.query('select id,status,requested_amount,approved_amount,created_at from preauth_requests where parent_id=$1 order by created_at',[id]),db.query('select full_name,uhid,gender,date_of_birth,abha_number from patients where id=$1',[p.patient_id])])
 return {preauth:p,patient:pt.rows[0],events:ev.rows,enhancements:enh.rows,next:PREAUTH_NEXT[p.status]||[]}}
// ---------- scheme claims ----------
/** Claim against an approved pre-auth. Amount: the package bill (if applied), else everything approved (initial + enhancements). */
export async function createSchemeClaim(db:Db,ctx:Ctx,preauthId:string){requireRole(ctx,[...R]);const p=await preauth(db,ctx,preauthId);if(p.kind!=='initial')throw new HttpError(409,'Claim on the original pre-auth, not the enhancement.');if(p.status!=='approved')throw new HttpError(409,'The pre-auth is not approved.')
 if((await db.query('select 1 from insurance_claims where preauth_id=$1 and status<>$2',[p.id,'rejected'])).rows[0])throw new HttpError(409,'A claim already exists for this pre-auth.')
 const a=p.admission_id?(await db.query('select * from admissions where id=$1',[p.admission_id])).rows[0]:null
 const approved=Number((await db.query("select coalesce(sum(approved_amount),0) s from preauth_requests where (id=$1 or parent_id=$1) and status='approved'",[p.id])).rows[0].s)
 const amount=a?.package_billing&&a.package_amount!=null?Math.min(Number(a.package_amount),approved||Number(a.package_amount)):approved
 const inv=a?(await db.query("select id from invoices where admission_id=$1 and status<>'cancelled' order by created_at desc limit 1",[a.id])).rows[0]:null
 const label=SCHEMES.find(s=>s.code===p.scheme)?.label||p.scheme
 const r=(await db.query("insert into insurance_claims(hospital_id,patient_id,admission_id,invoice_id,payer_name,policy_number,scheme,claimed_amount,status,preauth_id,remarks,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,'preauth_approved',$9,$10,$11) returning *",
  [ctx.hospitalId,p.patient_id,p.admission_id,inv?.id||null,p.payer_name||label,p.member_id,p.scheme,r2(amount),p.id,(p.packages||[]).map((x:any)=>x.code).join(', ')||null,ctx.userId])).rows[0]
 await audit(db,ctx,'create','claim',r.id,{preauth:p.id,amount});return r}
/** Claim status with submission / settlement detail (status rules come from insurance.ts). */
export async function updateSchemeClaim(db:Db,ctx:Ctx,id:string,b:any){const c=await updateClaim(db,ctx,id,b)
 if(b.status==='claim_submitted')await db.query('update insurance_claims set submitted_at=now() where id=$1',[id])
 if(b.status==='settled'){const ded=num(b.deductionAmount,'Deduction');await db.query('update insurance_claims set settled_at=now(),settlement_ref=$2,deduction_amount=$3,deduction_reason=$4 where id=$1',[id,opt(b.settlementRef),ded??(Number(c.claimed_amount)-Number(c.approved_amount||0)>0?r2(Number(c.claimed_amount)-Number(c.approved_amount)):null),opt(b.deductionReason)])}
 return (await db.query('select * from insurance_claims where id=$1',[id])).rows[0]}
export async function listSchemeClaims(db:Db,ctx:Ctx){requireRole(ctx,[...R]);return (await db.query("select c.*,p.full_name,p.uhid,a.admission_no,r.payer_ref,(select status from nhcx_messages m where m.hospital_id=c.hospital_id and m.entity='claim' and m.entity_id=c.id order by created_at desc limit 1) nhcx_status from insurance_claims c join patients p on p.id=c.patient_id left join admissions a on a.id=c.admission_id left join preauth_requests r on r.id=c.preauth_id where c.hospital_id=$1 and (c.preauth_id is not null or c.scheme in ('PMJAY','STATE','CGHS','ECHS','PRIVATE')) order by c.updated_at desc limit 200",[ctx.hospitalId])).rows}
const ascii=(s:any)=>String(s??'').replace(/₹/g,'Rs.').replace(/[–—]/g,'-').replace(/[^\x20-\x7E]/g,'?')
/** The existing claim packet plus a scheme page: packages, pre-auth trail and the itemised record (prices before package billing). */
export async function schemeClaimPacket(db:Db,ctx:Ctx,claimId:string){const base=await claimPacket(db,ctx,claimId);const c=(await db.query('select * from insurance_claims where id=$1 and hospital_id=$2',[claimId,ctx.hospitalId])).rows[0]
 if(!c?.admission_id&&!c?.preauth_id)return base
 const pdf=await PDFDocument.load(base.bytes);const f=await pdf.embedFont(StandardFonts.Helvetica),fb=await pdf.embedFont(StandardFonts.HelveticaBold);let page=pdf.addPage([595,842]);let y=800
 const line=(t:string,o:{bold?:boolean;size?:number;x?:number}={})=>{if(y<50){page=pdf.addPage([595,842]);y=800}page.drawText(ascii(t).slice(0,110),{x:40+(o.x||0),y,size:o.size||9,font:o.bold?fb:f,color:rgb(0.15,0.15,0.15)});y-=(o.size||9)+5}
 const inr=(n:any)=>'Rs. '+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
 line('Scheme billing (package)',{bold:true,size:14});line(`Scheme: ${c.scheme||'-'}   Beneficiary: ${c.policy_number}`)
 if(c.admission_id){const pb=await packageBill(db,{...ctx,role:'admin'},c.admission_id);line('Packages',{bold:true,size:11});for(const p of pb.packages)line(`${p.code}  ${p.name}  ${inr(p.rate)} x ${p.qty} @ ${p.pct}% = ${inr(p.amount)}`,{x:8});line(`Package amount billed to scheme: ${inr(pb.schemeAmount)}`,{bold:true});line(`Patient paid: ${inr(pb.patient.paid)}   Patient balance: ${inr(pb.patient.balance)}`)
  line('Itemised record (not billed to the patient)',{bold:true,size:11});for(const i of pb.itemised)line(`${i.description}  ${i.quantity} x ${inr(i.recordPrice)} = ${inr(i.amount)}`,{x:8});line(`Itemised total: ${inr(pb.itemisedTotal)}`,{bold:true})}
 if(c.preauth_id){const g=await getPreauth(db,{...ctx,role:'admin'},c.preauth_id);line('Pre-authorisation',{bold:true,size:11});line(`Payer ref: ${g.preauth.payer_ref||'-'}   Requested ${inr(g.preauth.requested_amount)}   Approved ${inr(g.preauth.approved_amount)}`,{x:8});for(const e of g.events)line(`${new Date(e.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}  ${e.from_status||'-'} -> ${e.to_status}${e.note?'  ('+e.note+')':''}${e.by_name?'  by '+e.by_name:''}`,{x:8})
  for(const e of g.enhancements)line(`Enhancement ${e.status}: requested ${inr(e.requested_amount)}, approved ${inr(e.approved_amount)}`,{x:8})}
 return {bytes:await pdf.save(),name:base.name}}
