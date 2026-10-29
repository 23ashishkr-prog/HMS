/** Per-hospital payment gateway (tenant-isolated).
 *  Stored in hospital_integrations kind=payments, encrypted with INTEGRATIONS_ENC_KEY.
 *  NEVER uses platform SaaS Razorpay keys (those are for plan subscriptions only).
 *  Visibility: admin + billing (billing = accounts role; no separate 'account' role exists). */
import {createHmac,timingSafeEqual} from 'crypto'
import {Ctx,Db,HttpError,audit,opt,requireRole} from './core'
import {encrypt,decrypt,mask} from './integrations'
import {appUrl} from './notify'

export const GATEWAY_ROLES:Array<'admin'|'billing'>=['admin','billing']
/** Staff who can take a patient payment (settings stay admin + billing). */
export const COLLECT_ROLES:Array<'admin'|'billing'|'reception'>=['admin','billing','reception']
export type HospGwProvider='razorpay' // structure for payu|cashfree later
export type HospGwCreds={configured:boolean;enabled:boolean;provider:HospGwProvider;mode:'test'|'live';keyId:string;keySecret:string;webhookSecret:string}

const KIND='payments'
const s=(v:unknown,max=500)=>String(v??'').trim().slice(0,max)

async function row(db:Db,hid:string){
  return (await db.query('select * from hospital_integrations where hospital_id=$1 and kind=$2',[hid,KIND])).rows[0]||null
}

/** Resolve THIS hospital's gateway only — no platform/env fallback. */
export async function getHospitalGatewayCreds(db:Db,hospitalId:string):Promise<HospGwCreds>{
  const r=await row(db,hospitalId)
  if(!r||r.status==='disconnected')return {configured:false,enabled:false,provider:'razorpay',mode:'test',keyId:'',keySecret:'',webhookSecret:''}
  let sec:Record<string,string>={}
  try{sec=decrypt(r.secrets)}catch{sec={}}
  const cfg=r.config||{}
  const keyId=s(sec.keyId||cfg.keyId)
  const keySecret=s(sec.keySecret,4000)
  const webhookSecret=s(sec.webhookSecret,4000)
  const enabled=cfg.enabled!==false&&cfg.enabled!=='false'
  const provider=(cfg.provider==='payu'||cfg.provider==='cashfree'?cfg.provider:'razorpay') as HospGwProvider
  const mode:('test'|'live')=(cfg.mode==='live'||keyId.startsWith('rzp_live'))?'live':'test'
  const configured=!!(keyId&&keySecret&&webhookSecret&&provider==='razorpay')
  return {configured,enabled:configured&&enabled,provider,mode,keyId,keySecret,webhookSecret}
}

export async function hospitalGatewayReady(db:Db,hospitalId:string){
  const c=await getHospitalGatewayCreds(db,hospitalId)
  return c.enabled
}

/** Masked view for admin/billing settings. Never returns raw secrets. */
export async function getHospitalGatewayView(db:Db,ctx:Ctx){
  requireRole(ctx,GATEWAY_ROLES)
  const r=await row(db,ctx.hospitalId)
  let sec:Record<string,string>={}
  let cfg:any={}
  if(r){cfg=r.config||{};try{sec=decrypt(r.secrets)}catch{sec={}}}
  const creds=await getHospitalGatewayCreds(db,ctx.hospitalId)
  return {
    kind:KIND,
    provider:cfg.provider||'razorpay',
    mode:cfg.mode||creds.mode,
    enabled:cfg.enabled!==false&&cfg.enabled!=='false',
    keyId:mask(sec.keyId),
    keySecret:mask(sec.keySecret),
    webhookSecret:mask(sec.webhookSecret),
    configured:creds.configured,
    active:creds.enabled,
    status:r?.status||'not_configured',
    lastError:r?.last_error||null,
    updatedAt:r?.updated_at||null,
    encryption:process.env.INTEGRATIONS_ENC_KEY?'INTEGRATIONS_ENC_KEY':'derived from SESSION_SECRET (set INTEGRATIONS_ENC_KEY)',
    webhookUrl:`${appUrl()}/api/webhooks/razorpay/${ctx.hospitalId}`,
    note:'This hospital\'s own gateway for patient invoice payments. Separate from platform SaaS plan billing.',
    accountRole:'billing',
    accountRoleNote:'No separate account role — billing role is the accounts desk. Admin and billing can manage; doctor/lab/reception/nurse/pharmacy cannot.',
  }
}

export async function saveHospitalGateway(db:Db,ctx:Ctx,b:any){
  requireRole(ctx,GATEWAY_ROLES)
  const cur=await row(db,ctx.hospitalId)
  let sec:Record<string,string>={}
  try{sec=decrypt(cur?.secrets)}catch{sec={}}
  const cfg:any={...(cur?.config||{})}
  const provider=s(b?.provider||cfg.provider||'razorpay')
  if(provider!=='razorpay')throw new HttpError(400,'Only Razorpay is available today. PayU/Cashfree can be added later.')
  cfg.provider=provider
  if(b?.mode==='live'||b?.mode==='test')cfg.mode=b.mode
  if(b?.enabled===true||b?.enabled==='true')cfg.enabled=true
  if(b?.enabled===false||b?.enabled==='false')cfg.enabled=false
  if(cfg.enabled===undefined)cfg.enabled=true

  for(const k of ['keyId','keySecret','webhookSecret'] as const){
    const v=b?.[k]
    if(typeof v==='string'&&v.trim()&&!v.includes('••••'))sec[k]=s(v,4000)
  }
  if(!(sec.keyId&&sec.keySecret&&sec.webhookSecret)){
    throw new HttpError(400,'Key ID, Key Secret and Webhook Secret are all required.')
  }
  if(!/^rzp_(test|live)_/.test(sec.keyId))throw new HttpError(400,'Key ID should start with rzp_test_ or rzp_live_')
  if(!cfg.mode)cfg.mode=sec.keyId.startsWith('rzp_live')?'live':'test'
  const status=cfg.enabled===false?'configured':'configured'
  await db.query(
    `insert into hospital_integrations(hospital_id,kind,config,secrets,status,last_error,updated_by,updated_at)
     values($1,$2,$3,$4,$5,null,$6,now())
     on conflict(hospital_id,kind) do update set config=$3,secrets=$4,status=$5,last_error=null,updated_by=$6,updated_at=now()`,
    [ctx.hospitalId,KIND,JSON.stringify(cfg),encrypt(sec),status,ctx.userId]
  )
  await audit(db,ctx,'integration_saved','integration',null,{kind:KIND,provider,enabled:cfg.enabled})
  return getHospitalGatewayView(db,ctx)
}

export async function clearHospitalGateway(db:Db,ctx:Ctx){
  requireRole(ctx,GATEWAY_ROLES)
  await db.query(
    `insert into hospital_integrations(hospital_id,kind,config,secrets,status,updated_by,updated_at)
     values($1,$2,'{}'::jsonb,null,'disconnected',$3,now())
     on conflict(hospital_id,kind) do update set config='{}'::jsonb,secrets=null,status='disconnected',last_error=null,updated_by=$3,updated_at=now()`,
    [ctx.hospitalId,KIND,ctx.userId]
  )
  await audit(db,ctx,'integration_disconnected','integration',null,{kind:KIND})
  return getHospitalGatewayView(db,ctx)
}

async function rzp(creds:HospGwCreds,path:string,method:'GET'|'POST',body?:unknown){
  if(!creds.configured)throw new HttpError(503,'Hospital payment gateway is not configured.')
  const auth=Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')
  const r=await fetch('https://api.razorpay.com/v1'+path,{method,headers:{Authorization:'Basic '+auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
  const j=await r.json().catch(()=>({}))
  if(!r.ok)throw new HttpError(502,typeof j?.error?.description==='string'?j.error.description:('Razorpay error '+r.status))
  return j
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAY_MODES=['cash','upi','card','netbanking','insurance','other','razorpay']

async function money(db:Db,invoiceId:string){
  const t=await db.query(
    `select coalesce((select sum(quantity*unit_price) from invoice_items where invoice_id=$1),0)::numeric gross,
      coalesce((select discount from invoices where id=$1),0)::numeric discount,
      coalesce((select sum(amount) from payments where invoice_id=$1),0)::numeric paid`,[invoiceId])
  const g=Number(t.rows[0].gross),d=Number(t.rows[0].discount),p=Number(t.rows[0].paid)
  return {gross:g,discount:d,paid:p,balance:Math.max(g-d-p,0)}
}

async function loadInvoice(db:Db,invoiceId:string,hospitalId?:string){
  const params:unknown[]=[invoiceId]
  let hid=''
  if(hospitalId){params.push(hospitalId);hid=' and i.hospital_id=$2'}
  return (await db.query(
    `select i.id,i.hospital_id,i.invoice_no,i.status,i.patient_id,i.discount,
      h.name hospital_name,h.code hospital_code,
      p.full_name,p.mobile,
      coalesce((select sum(quantity*unit_price) from invoice_items x where x.invoice_id=i.id),0)::numeric gross,
      coalesce((select sum(amount) from payments y where y.invoice_id=i.id),0)::numeric paid
     from invoices i
     join hospitals h on h.id=i.hospital_id
     left join patients p on p.id=i.patient_id
     where i.id=$1${hid}`,params)).rows[0]||null
}

function chargeOf(balance:number,requested?:number|null){
  if(requested==null||requested===(undefined as any))return balance
  const n=Number(requested)
  if(!Number.isFinite(n)||n<1)throw new HttpError(400,'Amount must be at least ₹1.')
  if(n>balance+0.001)throw new HttpError(400,'Amount exceeds the balance ₹'+balance.toFixed(2)+'.')
  return Math.round(n*100)/100
}

/** Staff checkout and the public payment link share this. Hospital keys only — never platform SaaS keys. */
async function openGatewayOrder(db:Db,hospitalId:string,invoiceId:string,requested:number|null,userId:string|null,includePatient:boolean){
  const inv=await loadInvoice(db,invoiceId,hospitalId)
  if(!inv)throw new HttpError(404,'Invoice not found.')
  if(inv.status==='cancelled'||inv.status==='paid')throw new HttpError(409,'Invoice is '+inv.status)
  const balance=Math.max(Number(inv.gross)-Number(inv.discount||0)-Number(inv.paid),0)
  if(balance<1)throw new HttpError(400,'Nothing due on this invoice.')
  const charge=chargeOf(balance,requested)
  const creds=await getHospitalGatewayCreds(db,hospitalId)
  if(!creds.enabled)throw new HttpError(503,'Online payments are off. Configure this hospital\'s Razorpay keys under Settings → Payments.')
  const amountPaise=Math.round(charge*100)
  const receipt=('inv_'+String(inv.invoice_no).replace(/\W/g,'').slice(0,20)+'_'+Date.now()).slice(0,40)
  const notes={hospital_id:hospitalId,invoice_id:invoiceId,invoice_no:inv.invoice_no,patient_id:inv.patient_id,product:'hms_invoice'}
  const order=await rzp(creds,'/orders','POST',{amount:amountPaise,currency:'INR',receipt,notes,payment_capture:1})
  await db.query(
    `insert into hospital_gateway_payments(hospital_id,invoice_id,patient_id,gateway,amount_inr,status,provider_order_id,raw,created_by)
     values($1,$2,$3,'razorpay',$4,'created',$5,$6,$7)`,
    [hospitalId,invoiceId,inv.patient_id,charge,order.id,JSON.stringify({order,notes}),userId]
  )
  return {
    orderId:order.id as string,
    amount:charge,
    amountPaise,
    currency:'INR',
    keyId:creds.keyId,
    mode:creds.mode,
    invoiceId,
    invoiceNo:inv.invoice_no,
    hospitalName:inv.hospital_name,
    hospitalCode:inv.hospital_code,
    description:includePatient?`Invoice ${inv.invoice_no} · ${inv.full_name}`:`Invoice ${inv.invoice_no}`,
    ...(includePatient?{patientName:inv.full_name,prefill:{name:inv.full_name,contact:inv.mobile||undefined}}:{ }),
  }
}

/** Create Razorpay order for some or all of the balance — hospital keys only. */
export async function createInvoiceGatewayOrder(db:Db,ctx:Ctx,invoiceId:string,requested?:number|null){
  requireRole(ctx,COLLECT_ROLES)
  return openGatewayOrder(db,ctx.hospitalId,invoiceId,requested??null,ctx.userId,true)
}

/** Public payment link. Invoice number, amount due and hospital name only — no clinical record. */
export async function publicPayView(db:Db,invoiceId:string){
  if(!UUID.test(String(invoiceId||'')))throw new HttpError(404,'Invoice not found.')
  const inv=await loadInvoice(db,invoiceId)
  if(!inv)throw new HttpError(404,'Invoice not found.')
  const balance=Math.max(Number(inv.gross)-Number(inv.discount||0)-Number(inv.paid),0)
  const creds=await getHospitalGatewayCreds(db,inv.hospital_id)
  const online=!!creds.enabled&&balance>=1&&inv.status!=='cancelled'&&inv.status!=='paid'
  return {
    hospitalName:inv.hospital_name,
    invoiceNo:inv.invoice_no,
    amountDue:balance,
    currency:'INR' as const,
    status:inv.status,
    online,
    keyId:online?creds.keyId:null,
  }
}

export async function publicInvoiceCheckout(db:Db,invoiceId:string,requested?:number|null){
  if(!UUID.test(String(invoiceId||'')))throw new HttpError(404,'Invoice not found.')
  const inv=await loadInvoice(db,invoiceId)
  if(!inv)throw new HttpError(404,'Invoice not found.')
  const amount=requested==null||(requested as any)===''?null:Number(requested)
  return openGatewayOrder(db,inv.hospital_id,invoiceId,amount,null,false)
}

export async function publicConfirmPayment(db:Db,invoiceId:string,b:any){
  if(!UUID.test(String(invoiceId||'')))throw new HttpError(404,'Invoice not found.')
  const inv=await loadInvoice(db,invoiceId)
  if(!inv)throw new HttpError(404,'Invoice not found.')
  const orderId=String(b?.razorpay_order_id||b?.orderId||'')
  const paymentId=String(b?.razorpay_payment_id||b?.paymentId||'')
  const signature=String(b?.razorpay_signature||b?.signature||'')
  if(!orderId||!paymentId||!signature)throw new HttpError(400,'Missing payment confirmation')
  await verifyHospitalCheckoutSignature(db,inv.hospital_id,orderId,paymentId,signature)
  await captureHospitalGatewayPayment(db,{hospitalId:inv.hospital_id,orderId,paymentId,signatureOk:true,raw:{public:true}})
  return publicPayView(db,invoiceId)
}

export async function verifyHospitalCheckoutSignature(db:Db,hospitalId:string,orderId:string,paymentId:string,signature:string){
  const creds=await getHospitalGatewayCreds(db,hospitalId)
  if(!creds.keySecret)throw new HttpError(503,'Gateway secret missing')
  const exp=createHmac('sha256',creds.keySecret).update(orderId+'|'+paymentId).digest('hex')
  const a=Buffer.from(exp),b=Buffer.from(String(signature||''))
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new HttpError(401,'Invalid payment signature')
  return true
}

export async function verifyHospitalWebhookSignature(db:Db,hospitalId:string,raw:string,sig:string){
  const creds=await getHospitalGatewayCreds(db,hospitalId)
  if(!creds.configured)throw new HttpError(503,'Gateway not configured')
  const exp=createHmac('sha256',creds.webhookSecret).update(raw).digest('hex')
  if(sig.length!==exp.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(exp)))throw new HttpError(401,'Bad signature')
  return creds
}

async function findPayment(db:Db,hospitalId:string,paymentId?:string|null,orderId?:string|null){
  if(paymentId){
    const byId=(await db.query(
      `select id,invoice_id,amount from payments where hospital_id=$1 and provider='razorpay' and provider_payment_id=$2`,
      [hospitalId,paymentId])).rows[0]
    if(byId)return byId
  }
  if(orderId){
    return (await db.query(
      `select id,invoice_id,amount from payments where hospital_id=$1 and provider='razorpay' and provider_order_id=$2 limit 1`,
      [hospitalId,orderId])).rows[0]||null
  }
  return null
}

async function markLedger(db:Db,ledger:any,opts:{hospitalId:string;orderId?:string|null;paymentId?:string|null;signatureOk?:boolean;raw?:unknown;userId?:string|null},invoiceId:string,amount:number){
  const paymentId=opts.paymentId||ledger?.provider_payment_id||null
  if(ledger){
    await db.query(
      `update hospital_gateway_payments set status='captured',provider_payment_id=coalesce($2,provider_payment_id),
        provider_signature_ok=$3,amount_inr=coalesce(nullif($4,0),amount_inr),raw=coalesce($5,raw),paid_at=coalesce(paid_at,now())
       where id=$1`,
      [ledger.id,paymentId,opts.signatureOk??true,amount||0,opts.raw?JSON.stringify(opts.raw):null])
    return
  }
  if(!paymentId&&!opts.orderId)return
  const patient=(await db.query('select patient_id from invoices where id=$1 and hospital_id=$2',[invoiceId,opts.hospitalId])).rows[0]
  await db.query(
    `insert into hospital_gateway_payments(hospital_id,invoice_id,patient_id,gateway,amount_inr,status,provider_order_id,provider_payment_id,provider_signature_ok,paid_at,raw,created_by)
     values($1,$2,$3,'razorpay',$4,'captured',$5,$6,$7,now(),$8,$9)
     on conflict (hospital_id, provider_payment_id) where provider_payment_id is not null
     do update set status='captured',provider_signature_ok=excluded.provider_signature_ok,paid_at=coalesce(hospital_gateway_payments.paid_at,now())`,
    [opts.hospitalId,invoiceId,patient?.patient_id||null,amount,opts.orderId||null,paymentId,opts.signatureOk??true,opts.raw?JSON.stringify(opts.raw):null,opts.userId||null])
}

/** Apply a confirmed online payment to the invoice. Idempotent on provider payment id (and order id). */
export async function captureHospitalGatewayPayment(db:Db,opts:{
  hospitalId:string;orderId?:string|null;paymentId?:string|null;amountInr?:number|null;
  signatureOk?:boolean;raw?:unknown;userId?:string|null
}){
  if(!opts.paymentId&&!opts.orderId)throw new HttpError(400,'Payment id required')
  let ledger=opts.orderId?(await db.query(
    `select * from hospital_gateway_payments where hospital_id=$1 and provider_order_id=$2 order by created_at desc limit 1`,
    [opts.hospitalId,opts.orderId])).rows[0]:null
  const paymentId=opts.paymentId||ledger?.provider_payment_id||null
  if(!ledger&&paymentId){
    ledger=(await db.query(
      `select * from hospital_gateway_payments where hospital_id=$1 and provider_payment_id=$2 limit 1`,
      [opts.hospitalId,paymentId])).rows[0]
  }
  const notes=(opts.raw as any)?.payload?.payment?.entity?.notes||(opts.raw as any)?.payload?.order?.entity?.notes||null
  const existing=await findPayment(db,opts.hospitalId,paymentId,opts.orderId||ledger?.provider_order_id||null)
  if(existing){
    await markLedger(db,ledger,{...opts,paymentId},existing.invoice_id,Number(existing.amount))
    return {ok:true,duplicate:true,invoiceId:existing.invoice_id,amount:Number(existing.amount)}
  }
  const invoiceId=ledger?.invoice_id||notes?.invoice_id||null
  let amount=Math.round(Number(opts.amountInr!=null?opts.amountInr:ledger?.amount_inr||0)*100)/100
  if(!(amount>0))throw new HttpError(400,'Payment amount required')
  if(!invoiceId)throw new HttpError(404,'Invoice for this payment was not found.')
  const inv=(await db.query('select id,status,patient_id from invoices where id=$1 and hospital_id=$2',[invoiceId,opts.hospitalId])).rows[0]
  if(!inv)throw new HttpError(404,'Invoice not found.')
  if(inv.status==='cancelled')throw new HttpError(409,'Invoice is cancelled.')
  const totals=await money(db,invoiceId)
  if(amount>totals.balance+0.01)throw new HttpError(409,'Online amount exceeds the balance on this invoice.')
  let uid=opts.userId||ledger?.created_by||null
  if(uid){
    const ok=(await db.query('select id from users where id=$1 and hospital_id=$2 and active',[uid,opts.hospitalId])).rows[0]
    if(!ok)uid=null
  }
  if(!uid)uid=(await db.query(`select id from users where hospital_id=$1 and role='admin' and active order by created_at limit 1`,[opts.hospitalId])).rows[0]?.id||null
  if(!uid)throw new HttpError(409,'No staff user is available to record this payment.')
  const ins=await db.query(
    `insert into payments(hospital_id,invoice_id,amount,mode,reference,received_by,provider,provider_order_id,provider_payment_id)
     values($1,$2,$3,'razorpay',$4,$5,'razorpay',$6,$7)
     on conflict (hospital_id, provider, provider_payment_id) where provider is not null and provider_payment_id is not null
     do nothing returning id`,
    [opts.hospitalId,invoiceId,amount,paymentId||opts.orderId||null,uid,opts.orderId||ledger?.provider_order_id||null,paymentId])
  if(ins.rows[0]){
    const now=await money(db,invoiceId)
    await db.query(`update invoices set status=$2 where id=$1`,[invoiceId,now.balance<=0.001?'paid':'partially_paid'])
  }
  await markLedger(db,ledger,{...opts,paymentId,userId:uid},invoiceId,amount)
  return {ok:true,duplicate:!ins.rows[0],invoiceId,amount}
}

export async function markHospitalGatewayFailed(db:Db,hospitalId:string,orderId:string|null,paymentId:string|null,raw:unknown){
  if(orderId){
    await db.query(
      `update hospital_gateway_payments set status='failed',provider_payment_id=coalesce($3,provider_payment_id),raw=$4,paid_at=now()
       where hospital_id=$1 and provider_order_id=$2 and status in ('created','authorized')`,
      [hospitalId,orderId,paymentId,JSON.stringify(raw)])
  }
}

/** Every recorded bill payment (cash, UPI, card, online) plus gateway attempts that have not posted yet. */
export async function listHospitalGatewayPayments(db:Db,ctx:Ctx,q:any={}){
  requireRole(ctx,GATEWAY_ROLES)
  const params:any[]=[ctx.hospitalId]
  const where:string[]=['true']
  const search=String(q.q||'').trim()
  const status=opt(q.status)
  const after=opt(q.after)||opt(q.from)
  const before=opt(q.before)||opt(q.to)
  if(search){
    params.push('%'+search.toLowerCase()+'%')
    where.push(`(lower(coalesce(patient_name,'')) like $${params.length} or lower(coalesce(invoice_no,'')) like $${params.length} or lower(coalesce(uhid,'')) like $${params.length} or lower(coalesce(reference,'')) like $${params.length} or lower(coalesce(provider_payment_id,'')) like $${params.length})`)
  }
  if(status&&PAY_MODES.includes(status)){params.push(status);where.push(`mode=$${params.length}`)}
  else if(status&&['created','authorized','failed','refunded'].includes(status)){params.push(status);where.push(`status=$${params.length}`)}
  if(after){params.push(after);where.push(`coalesce(paid_at,created_at)>=$${params.length}::timestamptz`)}
  if(before){params.push(before);where.push(`coalesce(paid_at,created_at)<($${params.length}::timestamptz + interval '1 day')`)}
  const rows=(await db.query(
    `with recorded as (
      select p.id::text id,'payment'::text source,p.invoice_id,i.patient_id,p.mode,
        p.amount::numeric amount_inr,p.reference,p.provider_order_id,p.provider_payment_id,
        'recorded'::text status,p.received_at paid_at,p.received_at created_at,
        i.invoice_no,pt.full_name patient_name,pt.uhid,u.full_name entered_by
      from payments p
      join invoices i on i.id=p.invoice_id
      join patients pt on pt.id=i.patient_id
      left join users u on u.id=p.received_by
      where p.hospital_id=$1
    ),
    attempts as (
      select g.id::text,'attempt'::text,g.invoice_id,g.patient_id,g.gateway mode,
        g.amount_inr,null::text reference,g.provider_order_id,g.provider_payment_id,
        g.status,g.paid_at,g.created_at,
        i.invoice_no,pt.full_name,pt.uhid,u.full_name
      from hospital_gateway_payments g
      left join invoices i on i.id=g.invoice_id
      left join patients pt on pt.id=g.patient_id
      left join users u on u.id=g.created_by
      where g.hospital_id=$1
        and g.status<>'captured'
        and not exists (
          select 1 from payments p
          where p.hospital_id=g.hospital_id and p.provider_payment_id is not null and p.provider_payment_id=g.provider_payment_id
        )
    ),
    receipts as (
      select r.id::text id,'receipt'::text source,null::uuid invoice_id,r.patient_id,r.mode,
        r.amount::numeric amount_inr,r.reference,null::text provider_order_id,null::text provider_payment_id,
        'recorded'::text status,r.received_at paid_at,r.received_at created_at,
        'Receipt'::text invoice_no,pt.full_name patient_name,pt.uhid,u.full_name entered_by
      from desk_receipts r
      join patients pt on pt.id=r.patient_id
      left join users u on u.id=r.received_by
      where r.hospital_id=$1
    )
    select * from (select * from recorded union all select * from attempts union all select * from receipts) x
    where ${where.join(' and ')}
    order by coalesce(paid_at,created_at) desc
    limit 500`,params)).rows
  const sums=(await db.query(
    `select coalesce(sum(amount),0)::float payments_total,
      coalesce(sum(amount) filter (where mode='razorpay'),0)::float online_total,
      coalesce(sum(amount) filter (where mode<>'razorpay'),0)::float manual_total,
      count(*)::int n
     from payments where hospital_id=$1`,[ctx.hospitalId])).rows[0]
  const invPaid=Number((await db.query(
    `select coalesce(sum((select coalesce(sum(amount),0) from payments y where y.invoice_id=i.id)),0)::float paid
     from invoices i where i.hospital_id=$1`,[ctx.hospitalId])).rows[0].paid)
  const attempts=Number((await db.query(
    `select count(*)::int n from hospital_gateway_payments g
     where g.hospital_id=$1 and g.status in ('created','authorized','failed')
       and not exists (select 1 from payments p where p.hospital_id=g.hospital_id and p.provider_payment_id is not null and p.provider_payment_id=g.provider_payment_id)`,
    [ctx.hospitalId])).rows[0].n)
  const rec=(await db.query(
    `select coalesce(sum(amount),0)::float total,count(*)::int n from desk_receipts where hospital_id=$1`,
    [ctx.hospitalId])).rows[0]
  const invoicePayments=Number(sums.payments_total)
  const paymentsTotal=invoicePayments+Number(rec.total)
  return {
    payments:rows,
    stats:{
      total:rows.length,
      recorded:Number(sums.n)+Number(rec.n),
      attempts,
      payments_total:paymentsTotal,
      online_total:Number(sums.online_total),
      manual_total:Number(sums.manual_total)+Number(rec.total),
      invoice_paid:invPaid,
      receipts_total:Number(rec.total),
      reconciled:Math.abs(invoicePayments-invPaid)<0.05,
      paid_inr:Number(sums.online_total),
    },
    gateway:await getHospitalGatewayView(db,ctx),
  }
}
