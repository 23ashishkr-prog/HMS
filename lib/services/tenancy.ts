import crypto from 'node:crypto'
import {Ctx,Db,HttpError,audit,opt,required,requireRole} from './core'
import {canonicalPlan,TRIAL_DAYS,upgradeLabel,PlanCode,PLAN_PRICE_INR,PLAN_ANNUAL_INR,isContactSalesPlan,trialPlanFromParam,aiFeaturesFor} from '../plans'
import {assertTrialAvailable,recordTrialClaim} from './trialIdentity'
export {canonicalPlan,upgradeLabel}
export const MODULES=['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk','ai','engagement'] as const
export type Module=typeof MODULES[number]
import {lifecycleView} from './lifecycle'
import {envPaymentsConfigured,paymentsConfiguredAsync} from './platformGateway'
/** Per-request memo so the api() gate and requireModule() share one subscription lookup. */
const subMemo=new WeakMap<object,any>()
export function memoSubscription(ctx:object,sub:any){subMemo.set(ctx,sub)}
export async function getSubscription(db:Db,hospitalId:string){const r=await db.query('select s.*,p.name plan_name,p.modules,p.max_users,p.max_patients from subscriptions s join plans p on p.code=s.plan_code where s.hospital_id=$1',[hospitalId]);const s=r.rows[0];if(!s)return null;const lc=lifecycleView(s)!;return {...s,usable:!lc.onHold&&['active','trialing'].includes(s.status),trialOver:lc.onHold,lifecycle:lc}}
export function entitlements(s:any){const mods:string[]=s?.modules||[];const has=(m:string)=>mods.includes(m);const code=(s?.plan_code||'basic') as PlanCode;return {planCode:code,planName:s?.plan_name,modules:mods,has,clinic:code==='clinic',basicOps:code==='basic'||code==='ai_engage',aiEngage:code==='ai_engage',aiFeatures:aiFeaturesFor(canonicalPlan(code)),upgradeFor:upgradeLabel}}
/** Central feature gate: every module API calls this with the session's hospital. */
export async function requireModule(db:Db,ctx:Ctx,module:Module){const s=subMemo.has(ctx)?subMemo.get(ctx):await getSubscription(db,ctx.hospitalId);if(!s||!s.usable)throw new HttpError(402,'Account on hold: subscription inactive or trial ended. Renew to continue.');if(!s.modules.includes(module))throw new HttpError(402,`${upgradeLabel(module)} (your plan: ${s.plan_name}).`);return s}
export async function assertLimit(db:Db,ctx:Ctx,kind:'users'|'patients'){const s=await getSubscription(db,ctx.hospitalId);const max=kind==='users'?s?.max_users:s?.max_patients;if(max==null)return;const r=await db.query(`select count(*)::int n from ${kind==='users'?'users':'patients'} where hospital_id=$1${kind==='users'?' and active=true':''}`,[ctx.hospitalId]);if(r.rows[0].n>=max)throw new HttpError(402,`Your plan allows ${max} ${kind}. Upgrade to add more.`)}
/** Hospital code from the name: 3-10 uppercase letters, unique. "Sunrise Multispeciality Hospital" → SUNRISE (or SMH…); collisions append letters then digits. */
const STOP=new Set(['THE','OF','AND','HOSPITAL','HOSPITALS','CLINIC','CENTRE','CENTER','PVT','LTD','PRIVATE','LIMITED','MEDICAL','HEALTHCARE','CARE','MULTISPECIALITY','MULTISPECIALTY','NURSING','HOME','DR','SHRI','SRI'])
export function codeCandidates(name:string){const w=String(name||'').toUpperCase().replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean);const core=w.filter(x=>!STOP.has(x));const use=core.length?core:w;const out:string[]=[]
 const first=(use[0]||'HOSP').slice(0,10);if(first.length>=3)out.push(first);const ini=w.map(x=>x[0]).join('');if(ini.length>=3)out.push(ini.slice(0,10));const two=(use[0]||'')+(use[1]||'');if(two.length>=3)out.push(two.slice(0,10));const joined=w.join('').slice(0,10);if(joined.length>=3)out.push(joined)
 if(!out.length)out.push((joined+'HSP').slice(0,3));return [...new Set(out)]}
export async function generateHospitalCode(db:Db,name:string){const c=codeCandidates(name);const taken=async(x:string)=>!!(await db.query('select 1 from hospitals where code=$1',[x])).rows[0]
 for(const x of c)if(!(await taken(x)))return x
 const base=c[0].slice(0,8);for(const L of 'ABCDEFGHJKLMNPQRSTUVWXYZ'){const x=base+L;if(!(await taken(x)))return x}
 for(let i=2;i<1000;i++){const x=base.slice(0,10-String(i).length)+i;if(!(await taken(x)))return x}
 throw new HttpError(409,'Could not generate a hospital code. Please contact support.')}
const slug=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10)
/** Public onboarding: creates tenant + first admin + trial subscription. */
export async function onboardHospital(db:Db,b:any){const name=required(b.hospitalName,'Hospital name');const email=required(b.adminEmail,'Admin email').toLowerCase().replace(/\s+/g,'');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw new HttpError(400,'Admin email is invalid.');const pw=String(b.password||'');if(pw.length<10)throw new HttpError(400,'Password must be at least 10 characters.');const freeTrial=b.paid!==true;const requestedRaw=opt(b.planCode);if(freeTrial&&isContactSalesPlan(requestedRaw))throw new HttpError(403,'AI + Customer Engagement is Contact Sales. There is no self-serve trial. Send a note from the onboarding page, or start a Clinic or Basic trial.',{contactSales:true,pricingPath:'/welcome#pricing'});const plan:PlanCode=freeTrial?trialPlanFromParam(requestedRaw):canonicalPlan(requestedRaw);const p=await db.query('select code from plans where code=$1 and active',[plan]);if(!p.rows[0])throw new HttpError(400,'Unknown plan.');if(freeTrial)await assertTrialAvailable(db,{...b,adminEmail:email,hospitalName:name});
 let code:string;if(opt(b.code)){code=slug(opt(b.code)!);if(code.length<3)throw new HttpError(400,'Hospital code must have at least 3 letters/digits.');const ex=await db.query('select 1 from hospitals where code=$1',[code]);if(ex.rows[0])throw new HttpError(409,'Hospital code '+code+' is taken. Choose another.')}else code=await generateHospitalCode(db,name)
 const gstin=opt(b.gstin);if(gstin&&!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase()))throw new HttpError(400,'GSTIN format is invalid.')
 const h=(await db.query('insert into hospitals(name,code,address,gstin,uhid_prefix,contact_email,contact_phone) values($1,$2,$3,$4,$2,$5,$6) returning id,code',[name,code,opt(b.address),gstin?.toUpperCase()||null,email,opt(b.phone)])).rows[0]
 const u=(await db.query("insert into users(hospital_id,email,full_name,role,password_hash,must_change_password) values($1,$2,$3,'admin',crypt($4,gen_salt('bf',10)),false) returning id",[h.id,email,required(b.adminName,'Admin name'),pw])).rows[0]
 await db.query("insert into subscriptions(hospital_id,plan_code,status,trial_started_at,trial_ends_at,currency) values($1,$2,'trialing',now(),now()+make_interval(days=>$3::int),'INR')",[h.id,plan,TRIAL_DAYS()])
 if(freeTrial)await recordTrialClaim(db,h.id,{adminEmail:email,phone:b.phone,hospitalName:name,gstin:b.gstin})
 await audit(db,{hospitalId:h.id,userId:u.id,role:'admin'},'onboard','hospital',h.id,{plan,trialDays:TRIAL_DAYS(),freeTrial});return {hospitalId:h.id,code:h.code,adminUserId:u.id,plan,trialDays:TRIAL_DAYS()}}
export async function updateSettings(db:Db,ctx:Ctx,b:any){requireRole(ctx,['admin']);const gstin=opt(b.gstin)?.toUpperCase()||null;if(gstin&&!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))throw new HttpError(400,'GSTIN format is invalid.');const pb=opt(b.pharmacyBilling);if(pb&&!['patient_bill','cash_sale'].includes(pb))throw new HttpError(400,'Pharmacy billing must be patient_bill or cash_sale.');const prefix=opt(b.uhidPrefix)?.toUpperCase()||null;if(prefix&&!/^[A-Z0-9]{2,10}$/.test(prefix))throw new HttpError(400,'UHID prefix: 2-10 letters/digits.');let fd:number|null=null;if(b.followupFreeDays!==undefined&&b.followupFreeDays!==''&&b.followupFreeDays!==null){fd=Number(b.followupFreeDays);if(!Number.isInteger(fd)||fd<0||fd>60)throw new HttpError(400,'Free follow-up window must be 0-60 days.')}const r=await db.query('update hospitals set name=coalesce($2,name),address=$3,gstin=$4,uhid_prefix=coalesce($5,uhid_prefix,code),contact_email=$6,contact_phone=$7,pharmacy_billing=coalesce($8,pharmacy_billing),followup_free_days=coalesce($9,followup_free_days),updated_at=now() where id=$1 returning id,name,code,address,gstin,uhid_prefix,contact_email,contact_phone,logo_url,pharmacy_billing,followup_free_days',[ctx.hospitalId,opt(b.name),opt(b.address),gstin,prefix,opt(b.contactEmail),opt(b.contactPhone),pb||null,fd]);await audit(db,ctx,'update','hospital_settings',ctx.hospitalId,pb?{pharmacyBilling:pb}:undefined);return r.rows[0]}
export async function getSettings(db:Db,ctx:Ctx){const r=await db.query('select id,name,code,address,gstin,coalesce(uhid_prefix,code) uhid_prefix,contact_email,contact_phone,logo_url,pharmacy_billing,followup_free_days from hospitals where id=$1',[ctx.hospitalId]);return {hospital:r.rows[0],subscription:await getSubscription(db,ctx.hospitalId),plans:(await db.query('select * from plans where active order by sort')).rows}}
export const ROLES_STAFF=['admin','reception','doctor','nurse','lab','pharmacy','billing'] as const
export async function createStaff(db:Db,ctx:Ctx,b:any){requireRole(ctx,['admin']);const role=required(b.role,'Role');if(!(ROLES_STAFF as readonly string[]).includes(role))throw new HttpError(400,'Invalid role.');const pw=String(b.password||'');if(pw.length<10)throw new HttpError(400,'Password must be at least 10 characters.');await assertLimit(db,ctx,'users');const email=required(b.email,'Email').toLowerCase();const dup=await db.query('select 1 from users where hospital_id=$1 and lower(email)=$2',[ctx.hospitalId,email]);if(dup.rows[0])throw new HttpError(409,'A user with that email already exists in this hospital.');const r=await db.query("insert into users(hospital_id,email,full_name,role,password_hash,must_change_password) values($1,$2,$3,$4,crypt($5,gen_salt('bf',10)),true) returning id,email,full_name,role,active",[ctx.hospitalId,email,required(b.fullName,'Full name'),role,pw]);const extra:any={};for(const [k] of PROFILE)if(b[k]!==undefined)extra[k]=b[k];if(Object.keys(extra).length)await updateStaff(db,ctx,r.rows[0].id,extra);await audit(db,ctx,'create','user',r.rows[0].id,{role});return r.rows[0]}
export async function listStaff(db:Db,ctx:Ctx){requireRole(ctx,['admin']);return (await db.query('select id,email,full_name,role,active,last_login_at,created_at,phone,department,designation,registration_no,photo_url,must_change_password from users where hospital_id=$1 order by active desc,role,full_name',[ctx.hospitalId])).rows}
const PROFILE:[string,string][]= [['phone','phone'],['department','department'],['designation','designation'],['registrationNo','registration_no'],['photoUrl','photo_url']]
function clean(k:string,v:any){if(v==null)return null;const s=String(v).trim();if(!s)return null;if(k==='phone'&&!/^[+0-9 ()-]{6,20}$/.test(s))throw new HttpError(400,'Phone number looks invalid.');if(k==='photoUrl'&&!/^(https:\/\/|data:image\/(png|jpe?g|webp);base64,)/.test(s))throw new HttpError(400,'Photo must be an https URL or an uploaded image.');if(k==='photoUrl'&&s.length>400000)throw new HttpError(400,'Photo is too large (max ~300 KB).');return s.slice(0,k==='photoUrl'?400000:200)}
/** Admin edits another user in the SAME hospital (hospital_id from the session only). Every change is audited (field names only, no values for secrets). */
export async function updateStaff(db:Db,ctx:Ctx,id:string,b:any){requireRole(ctx,['admin']);const cur=(await db.query('select id,role,active,email from users where id=$1 and hospital_id=$2',[id,ctx.hospitalId])).rows[0];if(!cur)throw new HttpError(404,'User not found.')
 const sets:string[]=[],vals:unknown[]=[id,ctx.hospitalId],changed:string[]=[];const add=(col:string,v:unknown,f:string)=>{vals.push(v);sets.push(`${col}=$${vals.length}`);changed.push(f)}
 if(b.fullName!==undefined){const n=String(b.fullName||'').trim();if(!n)throw new HttpError(400,'Full name is required.');add('full_name',n.slice(0,120),'fullName')}
 if(b.email!==undefined){const e=String(b.email||'').trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))throw new HttpError(400,'Email looks invalid.');if(e!==cur.email){const d=await db.query('select 1 from users where hospital_id=$1 and lower(email)=$2 and id<>$3',[ctx.hospitalId,e,id]);if(d.rows[0])throw new HttpError(409,'A user with that email already exists in this hospital.');add('email',e,'email')}}
 if(b.role!==undefined&&b.role!==cur.role){if(!(ROLES_STAFF as readonly string[]).includes(b.role))throw new HttpError(400,'Invalid role.');if(id===ctx.userId)throw new HttpError(400,'You cannot change your own role.');if(cur.role==='admin'){const n=(await db.query("select count(*)::int n from users where hospital_id=$1 and role='admin' and active",[ctx.hospitalId])).rows[0].n;if(n<=1)throw new HttpError(400,'Keep at least one active admin.')}add('role',b.role,'role')}
 for(const [k,col] of PROFILE)if(b[k]!==undefined)add(col,clean(k,b[k]),k)
 if(b.active!==undefined&&!!b.active!==cur.active){if(id===ctx.userId&&!b.active)throw new HttpError(400,'You cannot deactivate yourself.');add('active',!!b.active,'active')}
 if(!sets.length)return {ok:true,changed:[]}
 const r=await db.query(`update users set ${sets.join(',')},updated_at=now() where id=$1 and hospital_id=$2 returning id,email,full_name,role,active,phone,department,designation,registration_no`,vals);await audit(db,ctx,'update','user',id,{changed,role:b.role??undefined});return r.rows[0]}
export async function resetStaffPassword(db:Db,ctx:Ctx,id:string,password:string){requireRole(ctx,['admin']);if(typeof password!=='string'||password.length<10)throw new HttpError(400,'Password must be at least 10 characters.');const r=await db.query("update users set password_hash=crypt($1,gen_salt('bf',10)),must_change_password=true,password_changed_at=now(),updated_at=now() where id=$2 and hospital_id=$3 returning id",[password,id,ctx.hospitalId]);if(!r.rows[0])throw new HttpError(404,'User not found.');await audit(db,ctx,'reset_password','user',id,{forceChange:true});return {ok:true}}
export async function setStaffActive(db:Db,ctx:Ctx,id:string,active:boolean){await updateStaff(db,ctx,id,{active})}
/* ---- Payment provider hooks (Razorpay). Keys from platform_settings (preferred) or RAZORPAY_* env. ---- */
/** Sync env-only check. Prefer paymentsConfiguredAsync(db) when a DB handle is available. */
export const paymentsConfigured=()=>envPaymentsConfigured()
export {paymentsConfiguredAsync}

/** Activate / renew a hospital plan after a *confirmed* Razorpay payment (checkout signature or signed webhook).
 *  Never call this for patient bills — only Clinic/Basic/AI+ subscription. Idempotent on provider_payment_id. */
export async function activatePaidPlan(db:Db,opts:{hospitalId:string;planCode:string;period:'monthly'|'annual';paymentId?:string|null;orderId?:string|null;amountInr?:number|null;raw?:unknown;eventType?:string;signatureOk?:boolean}){
 const plan=canonicalPlan(opts.planCode)
 const period=opts.period==='annual'?'annual':'monthly'
 const months=period==='annual'?12:1
 if(!opts.paymentId&&!opts.orderId)throw new HttpError(400,'Confirmed payment id required to activate a paid plan.')
 if(opts.paymentId){
  const dup=await db.query('select 1 from subscription_payments where provider=$1 and provider_payment_id=$2',['razorpay',opts.paymentId])
  if(dup.rows[0]){
   const s=(await db.query('select * from subscriptions where hospital_id=$1',[opts.hospitalId])).rows[0]
   return {ok:true,duplicate:true,subscription:s}
  }
 }
 const amount=Number(opts.amountInr!=null?opts.amountInr:(period==='annual'?PLAN_ANNUAL_INR[plan]:PLAN_PRICE_INR[plan]))
 await db.query('insert into subscription_events(hospital_id,provider,event_type,payload) values($1,$2,$3,$4)',[opts.hospitalId,'razorpay',opts.eventType||'payment.captured',JSON.stringify(opts.raw??{paymentId:opts.paymentId,orderId:opts.orderId,plan,period,amount})])
 try{
  // Prefer upgrading an existing 'created' row for this order; else insert captured.
  const up=opts.orderId?(await db.query(
   `update subscription_payments set status='captured',provider_payment_id=coalesce($2,provider_payment_id),
     provider_signature_ok=$3,amount_inr=$4,amount_in_inr=$4,currency='INR',plan_code=$5,billing_period=$6,raw=$7,paid_at=now()
    where provider='razorpay' and provider_order_id=$1 and status in ('created','authorized') returning id`,
   [opts.orderId,opts.paymentId||null,opts.signatureOk??true,amount,plan,period,JSON.stringify(opts.raw??{})]
  )).rows[0]:null
  if(!up){
   await db.query(
    `insert into subscription_payments(hospital_id,plan_code,billing_period,amount_inr,amount_in_inr,currency,status,provider,provider_order_id,provider_payment_id,provider_signature_ok,raw)
     values($1,$2,$3,$4,$4,'INR','captured','razorpay',$5,$6,$7,$8)`,
    [opts.hospitalId,plan,period,amount,opts.orderId||null,opts.paymentId||null,opts.signatureOk??true,JSON.stringify(opts.raw??{})]
   )
  }
 }catch(e:any){if(e?.code!=='23505')throw e}

 const r=await db.query(`update subscriptions set
   status='active',
   plan_code=$2,
   billing_period=$3,
   current_period_start=now(),
   current_period_end=now()+($4::text||' months')::interval,
   hold_started_at=null,
   hold_extended_until=null,
   provider='razorpay',
   last_payment_id=coalesce($5,last_payment_id),
   last_order_id=coalesce($6,last_order_id),
   currency='INR',
   amount_in_inr=$7,
   updated_at=now()
  where hospital_id=$1 returning *`,[opts.hospitalId,plan,period,String(months),opts.paymentId||null,opts.orderId||null,amount])
 if(!r.rows[0])throw new HttpError(404,'Hospital subscription not found')
 await db.query(`update hospitals set status='active',updated_at=now() where id=$1 and status<>'active'`,[opts.hospitalId])
 return {ok:true,subscription:r.rows[0]}
}

/** Platform: payment ledger for one hospital (plan subscriptions only). */
export async function platformListPayments(db:Db,hospitalId:string){
 return (await db.query(
  `select sp.id,sp.hospital_id,sp.plan_code,sp.billing_period,sp.amount_inr,sp.currency,
    coalesce(sp.amount_in_inr, case when upper(coalesce(sp.currency,'INR'))='INR' then sp.amount_inr end) amount_in_inr,sp.status,sp.provider,
    sp.provider_order_id,sp.provider_payment_id,sp.provider_signature_ok,sp.paid_at,sp.created_at,
    s.current_period_start,s.current_period_end,s.status as sub_status
   from subscription_payments sp
   left join subscriptions s on s.hospital_id=sp.hospital_id
   where sp.hospital_id=$1 order by sp.paid_at desc nulls last, sp.created_at desc limit 100`,[hospitalId]
 )).rows
}

/** Platform Payment check: all plan payments across hospitals. */
export async function platformListAllPayments(db:Db,q:any={}){
 const params:any[]=[]
 const where:string[]=['true']
 const search=String(q.q||q.search||'').trim()
 const status=opt(q.status)
 const hid=opt(q.hospitalId)
 const after=opt(q.after)||opt(q.from)
 const before=opt(q.before)||opt(q.to)
 if(search){params.push('%'+search.toLowerCase()+'%');where.push(`(lower(h.name) like $${params.length} or lower(h.code) like $${params.length})`)}
 if(status){params.push(status);where.push(`sp.status=$${params.length}`)}
 if(hid){params.push(hid);where.push(`sp.hospital_id=$${params.length}`)}
 if(after){params.push(after);where.push(`coalesce(sp.paid_at,sp.created_at)>=$${params.length}::timestamptz`)}
 if(before){params.push(before);where.push(`coalesce(sp.paid_at,sp.created_at)<($${params.length}::timestamptz + interval '1 day')`)}
 const sql=`select sp.id,sp.hospital_id,sp.plan_code,sp.billing_period,sp.amount_inr,sp.currency,
   coalesce(sp.amount_in_inr, case when upper(coalesce(sp.currency,'INR'))='INR' then sp.amount_inr end) amount_in_inr,sp.status,sp.provider,
   sp.provider_order_id,sp.provider_payment_id,sp.provider_signature_ok,sp.paid_at,sp.created_at,
   h.name hospital_name,h.code hospital_code,
   s.current_period_start,s.current_period_end,s.status as sub_status,s.plan_code as current_plan
  from subscription_payments sp
  join hospitals h on h.id=sp.hospital_id
  left join subscriptions s on s.hospital_id=sp.hospital_id
  where ${where.join(' and ')}
  order by coalesce(sp.paid_at,sp.created_at) desc
  limit 500`
 return (await db.query(sql,params)).rows
}

export async function platformPaymentStats(db:Db){
 const r=await db.query(`select
   count(*)::int as total,
   count(*) filter (where status='created')::int as created,
   count(*) filter (where status in ('captured','authorized'))::int as paid,
   count(*) filter (where status='failed')::int as failed,
   coalesce(sum(coalesce(amount_in_inr, case when upper(coalesce(currency,'INR'))='INR' then amount_inr end)) filter (where status in ('captured','authorized')),0)::numeric as paid_inr
  from subscription_payments`)
 const by=await db.query(`select coalesce(nullif(upper(btrim(currency)),''),'INR') currency,
   coalesce(sum(amount_inr) filter (where status in ('captured','authorized')),0)::numeric amount,
   coalesce(sum(coalesce(amount_in_inr, case when upper(coalesce(currency,'INR'))='INR' then amount_inr end)) filter (where status in ('captured','authorized')),0)::numeric amount_in_inr,
   count(*) filter (where status in ('captured','authorized'))::int count
  from subscription_payments group by 1 order by 1`)
 return {...r.rows[0], by_currency:by.rows, missing_inr:0}
}

/** Platform: single hospital live tenant detail + recent payments. */
export async function platformHospitalDetail(db:Db,hospitalId:string){
 const h=(await db.query(
  `select h.id,h.name,h.code,h.status,h.created_at,h.contact_email,h.contact_phone,h.address,h.gstin,
    s.plan_code,s.status sub_status,s.trial_started_at,s.trial_ends_at,s.current_period_start,s.current_period_end,
    s.hold_started_at,s.hold_extended_until,s.purged_at,s.provider,s.billing_period,s.currency,s.amount_in_inr,
    s.last_payment_id,s.last_order_id,s.updated_at sub_updated_at,
    a.full_name admin_name,a.email admin_email,a.phone admin_phone,
    (select count(*)::int from users u where u.hospital_id=h.id) users,
    (select count(*)::int from patients p where p.hospital_id=h.id) patients
   from hospitals h
   left join subscriptions s on s.hospital_id=h.id
   left join lateral (
     select full_name,email,phone from users u where u.hospital_id=h.id and u.role='admin' and u.active order by u.created_at asc limit 1
   ) a on true
   where h.id=$1`,[hospitalId])).rows[0]
 if(!h)throw new HttpError(404,'Hospital not found')
 const payments=await platformListPayments(db,hospitalId)
 const events=await platformListEvents(db,{hospitalId,limit:40})
 return {hospital:h,payments,events}
}


export async function applyProviderEvent(db:Db,hospitalId:string,event:{type:string;planCode?:string;period?:string;periodEnd?:string;periodStart?:string;subscriptionId?:string;customerId?:string;paymentId?:string;orderId?:string;amountInr?:number},raw:unknown){
 if(event.type==='payment.failed'){
  if(event.orderId){
   await db.query(`update subscription_payments set status='failed',provider_payment_id=coalesce($2,provider_payment_id),raw=$3,paid_at=now()
    where provider='razorpay' and provider_order_id=$1 and status in ('created','authorized')`,[event.orderId,event.paymentId||null,JSON.stringify(raw)])
  }
  await db.query('insert into subscription_events(hospital_id,provider,event_type,payload) values($1,$2,$3,$4)',[hospitalId,'razorpay',event.type,JSON.stringify(raw)])
  return
 }
 if(event.type==='payment.captured'||event.type==='order.paid'){
  if(!event.paymentId&&!event.orderId)return // never activate without a payment reference
  const period=(event.period==='annual'?'annual':'monthly') as 'monthly'|'annual'
  return activatePaidPlan(db,{hospitalId,planCode:event.planCode||'basic',period,paymentId:event.paymentId,orderId:event.orderId,amountInr:event.amountInr,raw,eventType:event.type,signatureOk:true})
 }
 await db.query('insert into subscription_events(hospital_id,provider,event_type,payload) values($1,$2,$3,$4)',[hospitalId,'razorpay',event.type,JSON.stringify(raw)])
 const map:Record<string,string>={'subscription.activated':'active','subscription.charged':'active','subscription.pending':'past_due','subscription.halted':'past_due','subscription.cancelled':'cancelled','subscription.completed':'expired'}
 const status=map[event.type];if(!status)return
 await db.query(`update subscriptions set status=$2,
  hold_started_at=case when $2='active' then null else hold_started_at end,
  hold_extended_until=case when $2='active' then null else hold_extended_until end,
  plan_code=coalesce($3,plan_code),
  current_period_end=coalesce($4::timestamptz,current_period_end),
  current_period_start=coalesce($7::timestamptz,current_period_start),
  provider='razorpay',
  provider_subscription_id=coalesce($5,provider_subscription_id),
  provider_customer_id=coalesce($6,provider_customer_id),
  updated_at=now() where hospital_id=$1`,[hospitalId,status,event.planCode?canonicalPlan(event.planCode):null,event.periodEnd||null,event.subscriptionId||null,event.customerId||null,event.periodStart||null])
}

function eventMoney(payload:unknown){
 let p:any=payload
 if(typeof p==='string'){try{p=JSON.parse(p)}catch{return {}}}
 if(!p||typeof p!=='object')return {}
 const pay=p.payload?.payment?.entity
 const ord=p.payload?.order?.entity
 if(pay?.amount!=null||ord?.amount!=null){
  const raw=Number(pay?.amount??ord?.amount)
  const currency=String(pay?.currency||ord?.currency||'INR').toUpperCase()
  const amount=Number.isFinite(raw)?Math.round(raw)/100:null
  return {currency,amount,amount_in_inr:currency==='INR'?amount:null,plan_code:typeof (pay?.notes||ord?.notes)?.plan_code==='string'?(pay?.notes||ord?.notes).plan_code:null}
 }
 if(p.amount!=null&&p.payload==null){
  const amount=Number(p.amount)
  const currency=String(p.currency||'INR').toUpperCase()
  if(!Number.isFinite(amount))return {}
  const inr=p.amount_in_inr!=null?Number(p.amount_in_inr):(currency==='INR'?amount:null)
  return {currency,amount,amount_in_inr:Number.isFinite(inr)?inr:null,plan_code:typeof p.plan==='string'?p.plan:null}
 }
 return {}
}
export async function platformListEvents(db:Db,q:any={}){
 const params:any[]=[]
 const where:string[]=['true']
 const hid=opt(q.hospitalId)
 const limit=Math.min(100,Math.max(1,Number(q.limit)||40))
 if(hid){params.push(hid);where.push(`e.hospital_id=$${params.length}`)}
 params.push(limit)
 const rows=(await db.query(`select e.id,e.hospital_id,e.provider,e.event_type,e.payload,e.received_at,
   h.name hospital_name,h.code hospital_code
  from subscription_events e
  left join hospitals h on h.id=e.hospital_id
  where ${where.join(' and ')}
  order by e.received_at desc
  limit $${params.length}`,params)).rows
 return rows.map((r:any)=>{const money=eventMoney(r.payload);return {id:r.id,hospital_id:r.hospital_id,hospital_name:r.hospital_name,hospital_code:r.hospital_code,provider:r.provider,event_type:r.event_type,received_at:r.received_at,...money}})
}

/* ---- Platform super-admin ---- */
export async function platformListHospitals(db:Db,q:any={}){
 const search=String(q.q||q.search||'').trim()
 const plan=opt(q.plan)||opt(q.planCode)
 const status=opt(q.status)||opt(q.subStatus)
 const params:any[]=[]
 const where:string[]=['true']
 if(search){params.push('%'+search.toLowerCase()+'%');where.push(`(lower(h.name) like $${params.length} or lower(h.code) like $${params.length} or lower(coalesce(h.contact_email,'')) like $${params.length} or lower(coalesce(a.email,'')) like $${params.length})`)}
 if(plan){params.push(canonicalPlan(plan));where.push(`s.plan_code=$${params.length}`)}
 if(status){params.push(status);where.push(`s.status=$${params.length}`)}
 const sql=`select h.id,h.name,h.code,h.status,h.created_at,h.contact_email,h.contact_phone,
  s.plan_code,s.status sub_status,s.trial_started_at,s.trial_ends_at,s.current_period_start,s.current_period_end,
  s.hold_started_at,s.hold_extended_until,s.purged_at,s.provider,s.billing_period,s.currency,s.amount_in_inr,
  s.last_payment_id,s.last_order_id,s.updated_at sub_updated_at,
  a.full_name admin_name,a.email admin_email,
  (select count(*)::int from users u where u.hospital_id=h.id) users,
  (select count(*)::int from patients p where p.hospital_id=h.id) patients
 from hospitals h
 left join subscriptions s on s.hospital_id=h.id
 left join lateral (
   select full_name,email from users u where u.hospital_id=h.id and u.role='admin' and u.active order by u.created_at asc limit 1
 ) a on true
 where ${where.join(' and ')}
 order by h.created_at desc`
 return (await db.query(sql,params)).rows
}

export async function platformHospitalStats(db:Db){
 const r=await db.query(`select
   count(*)::int as total,
   count(*) filter (where s.status='trialing')::int as trial,
   count(*) filter (where s.status='active')::int as active,
   count(*) filter (where s.status='on_hold')::int as held,
   count(*) filter (where s.status in ('expired','cancelled'))::int as expired,
   count(*) filter (where s.status='past_due')::int as past_due,
   count(*) filter (where coalesce(s.plan_code,'basic')='clinic')::int as plan_clinic,
   count(*) filter (where coalesce(s.plan_code,'basic')='basic')::int as plan_basic,
   count(*) filter (where coalesce(s.plan_code,'basic')='ai_engage')::int as plan_ai,
   count(*) filter (where s.provider='razorpay' and s.last_payment_id is not null)::int as paid_via_razorpay
  from hospitals h left join subscriptions s on s.hospital_id=h.id`)
 return r.rows[0]
}

export async function platformSetSubscription(db:Db,hospitalId:string,b:any){const st=required(b.status,'Status');if(!['trialing','active','past_due','cancelled','expired','on_hold'].includes(st))throw new HttpError(400,'Invalid status');const r=await db.query('update subscriptions set status=$2,hold_started_at=case when $2 in (\'active\',\'trialing\') then null when $2=\'on_hold\' then coalesce(hold_started_at,now()) else hold_started_at end,plan_code=coalesce($3,plan_code),updated_at=now() where hospital_id=$1 returning *',[hospitalId,st,opt(b.planCode)?canonicalPlan(opt(b.planCode)):null]);if(!r.rows[0])throw new HttpError(404,'Hospital not found');return r.rows[0]}

/** Platform owner: list admin users for a hospital (owner-only). */
export async function platformListHospitalAdmins(db:Db,hospitalId:string){
 const h=(await db.query('select id,code,name from hospitals where id=$1',[hospitalId])).rows[0]
 if(!h)throw new HttpError(404,'Hospital not found.')
 const admins=(await db.query(
  `select id,email,full_name,active,must_change_password,last_login_at from users
   where hospital_id=$1 and role='admin' order by active desc,created_at asc`,[hospitalId])).rows
 return {hospital:h,admins}
}
/** Platform owner: set a temporary password for a hospital admin. Shown once in the API response; forces change at next hospital login. Audited — password never written to logs. */
export async function platformResetAdminPassword(db:Db,hospitalId:string,b:any,plat:{id:string;email:string}){
 const h=(await db.query('select id,code,name from hospitals where id=$1',[hospitalId])).rows[0]
 if(!h)throw new HttpError(404,'Hospital not found.')
 const userId=opt(b.userId)
 const target=userId
  ?(await db.query("select id,email,full_name from users where id=$1 and hospital_id=$2 and role='admin'",[userId,hospitalId])).rows[0]
  :(await db.query("select id,email,full_name from users where hospital_id=$1 and role='admin' and active order by created_at asc limit 1",[hospitalId])).rows[0]
 if(!target)throw new HttpError(404,userId?'Admin user not found in this hospital.':'No active admin for this hospital.')
 let password=typeof b.password==='string'?b.password:''
 if(!password){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'
  const bytes=crypto.randomBytes(14)
  password=Array.from(bytes,(x:number)=>alphabet[x%alphabet.length]).join('')
 }
 if(password.length<10)throw new HttpError(400,'Password must be at least 10 characters.')
 await db.query("update users set password_hash=crypt($1,gen_salt('bf',10)),must_change_password=true,password_changed_at=now(),updated_at=now() where id=$2 and hospital_id=$3",[password,target.id,hospitalId])
 await db.query(
  "insert into audit_log(hospital_id,user_id,action,entity,entity_id,details) values($1,$2,'platform_reset_admin_password','user',$3,$4)",
  [hospitalId,target.id,target.id,JSON.stringify({byPlatformAdminId:plat.id,byPlatformEmail:plat.email,forceChange:true,targetEmail:target.email})]
 ).catch(()=>{})
 return {ok:true,userId:target.id,email:target.email,fullName:target.full_name,temporaryPassword:password,mustChangePassword:true,hospitalCode:h.code}
}
