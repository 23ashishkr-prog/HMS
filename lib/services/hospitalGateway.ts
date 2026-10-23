/** Per-hospital payment gateway (tenant-isolated).
 *  Stored in hospital_integrations kind=payments, encrypted with INTEGRATIONS_ENC_KEY.
 *  NEVER uses platform SaaS Razorpay keys (those are for plan subscriptions only).
 *  Visibility: admin + billing (billing = accounts role; no separate 'account' role exists). */
import {createHmac,timingSafeEqual} from 'crypto'
import {Ctx,Db,HttpError,audit,opt,requireRole} from './core'
import {encrypt,decrypt,mask} from './integrations'
import {appUrl} from './notify'

export const GATEWAY_ROLES:Array<'admin'|'billing'>=['admin','billing']
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
    note:'This hospital\'s own gateway for patient invoice payments. Completely separate from platform SaaS plan billing.',
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

/** Create Razorpay order for an open invoice balance — hospital keys only. */
export async function createInvoiceGatewayOrder(db:Db,ctx:Ctx,invoiceId:string){
  requireRole(ctx,GATEWAY_ROLES)
  const creds=await getHospitalGatewayCreds(db,ctx.hospitalId)
  if(!creds.enabled)throw new HttpError(503,'Online payments are off. Configure this hospital\'s Razorpay keys under Billing → Payment gateway.')
  const inv=(await db.query(
    `select i.id,i.invoice_no,i.status,i.patient_id,p.full_name,p.mobile,p.uhid,
      coalesce((select sum(quantity*unit_price) from invoice_items x where x.invoice_id=i.id),0)::numeric gross,
      coalesce(i.discount,0)::numeric discount,
      coalesce((select sum(amount) from payments y where y.invoice_id=i.id),0)::numeric paid
     from invoices i join patients p on p.id=i.patient_id
     where i.id=$1 and i.hospital_id=$2`,[invoiceId,ctx.hospitalId])).rows[0]
  if(!inv)throw new HttpError(404,'Invoice not found.')
  if(inv.status==='cancelled'||inv.status==='paid')throw new HttpError(409,'Invoice is '+inv.status)
  const balance=Math.max(Number(inv.gross)-Number(inv.discount)-Number(inv.paid),0)
  if(balance<1)throw new HttpError(400,'Nothing due on this invoice.')
  const amountPaise=Math.round(balance*100)
  const h=(await db.query('select code from hospitals where id=$1',[ctx.hospitalId])).rows[0]
  const receipt=('inv_'+String(inv.invoice_no).replace(/\W/g,'').slice(0,20)+'_'+Date.now()).slice(0,40)
  const notes={hospital_id:ctx.hospitalId,invoice_id:invoiceId,invoice_no:inv.invoice_no,patient_id:inv.patient_id,product:'hms_invoice'}
  const order=await rzp(creds,'/orders','POST',{amount:amountPaise,currency:'INR',receipt,notes,payment_capture:1})
  await db.query(
    `insert into hospital_gateway_payments(hospital_id,invoice_id,patient_id,gateway,amount_inr,status,provider_order_id,raw,created_by)
     values($1,$2,$3,'razorpay',$4,'created',$5,$6,$7)`,
    [ctx.hospitalId,invoiceId,inv.patient_id,balance,order.id,JSON.stringify({order,notes}),ctx.userId]
  )
  return {
    orderId:order.id as string,
    amount:balance,
    amountPaise,
    currency:'INR',
    keyId:creds.keyId,
    mode:creds.mode,
    invoiceId,
    invoiceNo:inv.invoice_no,
    patientName:inv.full_name,
    description:`Invoice ${inv.invoice_no} · ${inv.full_name}`,
    prefill:{name:inv.full_name,contact:inv.mobile||undefined},
    hospitalCode:h?.code,
  }
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

/** Apply confirmed online payment to invoice + ledger. Idempotent on provider_payment_id. */
export async function captureHospitalGatewayPayment(db:Db,opts:{
  hospitalId:string;orderId?:string|null;paymentId?:string|null;amountInr?:number|null;
  signatureOk?:boolean;raw?:unknown;userId?:string|null
}){
  if(!opts.paymentId&&!opts.orderId)throw new HttpError(400,'Payment id required')
  if(opts.paymentId){
    const dup=await db.query(
      `select 1 from hospital_gateway_payments where hospital_id=$1 and provider_payment_id=$2 and status in ('captured','authorized')`,
      [opts.hospitalId,opts.paymentId])
    if(dup.rows[0])return {ok:true,duplicate:true}
  }
  let ledger=opts.orderId?(await db.query(
    `select * from hospital_gateway_payments where hospital_id=$1 and provider_order_id=$2 order by created_at desc limit 1`,
    [opts.hospitalId,opts.orderId])).rows[0]:null
  if(!ledger&&opts.paymentId){
    ledger=(await db.query(
      `select * from hospital_gateway_payments where hospital_id=$1 and provider_payment_id=$2 limit 1`,
      [opts.hospitalId,opts.paymentId])).rows[0]
  }
  const invoiceId=ledger?.invoice_id||opts.raw&&(opts.raw as any)?.payload?.payment?.entity?.notes?.invoice_id
  const amount=Number(opts.amountInr!=null?opts.amountInr:ledger?.amount_inr||0)
  if(ledger){
    await db.query(
      `update hospital_gateway_payments set status='captured',provider_payment_id=coalesce($2,provider_payment_id),
        provider_signature_ok=$3,amount_inr=coalesce(nullif($4,0),amount_inr),raw=coalesce($5,raw),paid_at=now()
       where id=$1`,
      [ledger.id,opts.paymentId||null,opts.signatureOk??true,amount||0,opts.raw?JSON.stringify(opts.raw):null]
    )
  }
  if(invoiceId&&amount>0){
    const inv=(await db.query('select id,status from invoices where id=$1 and hospital_id=$2',[invoiceId,opts.hospitalId])).rows[0]
    if(inv&&inv.status!=='cancelled'){
      const exist=opts.paymentId?(await db.query(
        `select 1 from payments where hospital_id=$1 and provider='razorpay' and provider_payment_id=$2`,
        [opts.hospitalId,opts.paymentId])).rows[0]:null
      if(!exist){
        const receivedBy=opts.userId||ledger?.created_by
        let uid=receivedBy
        if(!uid){
          uid=(await db.query(`select id from users where hospital_id=$1 and role='admin' and active order by created_at limit 1`,[opts.hospitalId])).rows[0]?.id
        }
        if(uid){
          await db.query(
            `insert into payments(hospital_id,invoice_id,amount,mode,reference,received_by,provider,provider_order_id,provider_payment_id)
             values($1,$2,$3,'razorpay',$4,$5,'razorpay',$6,$7)`,
            [opts.hospitalId,invoiceId,amount,opts.paymentId||opts.orderId,uid,opts.orderId||null,opts.paymentId||null]
          )
          const t=await db.query(
            `select coalesce((select sum(quantity*unit_price) from invoice_items where invoice_id=$1),0)::numeric gross,
              coalesce((select discount from invoices where id=$1),0)::numeric discount,
              coalesce((select sum(amount) from payments where invoice_id=$1),0)::numeric paid`,[invoiceId])
          const g=Number(t.rows[0].gross),d=Number(t.rows[0].discount),p=Number(t.rows[0].paid)
          const bal=Math.max(g-d-p,0)
          await db.query(`update invoices set status=$2 where id=$1`,[invoiceId,bal<=0.001?'paid':'partially_paid'])
        }
      }
    }
  }
  return {ok:true,invoiceId,amount}
}

export async function markHospitalGatewayFailed(db:Db,hospitalId:string,orderId:string|null,paymentId:string|null,raw:unknown){
  if(orderId){
    await db.query(
      `update hospital_gateway_payments set status='failed',provider_payment_id=coalesce($3,provider_payment_id),raw=$4,paid_at=now()
       where hospital_id=$1 and provider_order_id=$2 and status in ('created','authorized')`,
      [hospitalId,orderId,paymentId,JSON.stringify(raw)]
    )
  }
}

/** Confirmation list for admin/billing. */
export async function listHospitalGatewayPayments(db:Db,ctx:Ctx,q:any={}){
  requireRole(ctx,GATEWAY_ROLES)
  const params:any[]=[ctx.hospitalId]
  const where:string[]=['g.hospital_id=$1']
  const search=String(q.q||'').trim()
  const status=opt(q.status)
  const after=opt(q.after)||opt(q.from)
  const before=opt(q.before)||opt(q.to)
  if(search){params.push('%'+search.toLowerCase()+'%');where.push(`(lower(coalesce(p.full_name,'')) like $${params.length} or lower(coalesce(i.invoice_no,'')) like $${params.length} or lower(coalesce(p.uhid,'')) like $${params.length})`)}
  if(status){params.push(status);where.push(`g.status=$${params.length}`)}
  if(after){params.push(after);where.push(`coalesce(g.paid_at,g.created_at)>=$${params.length}::timestamptz`)}
  if(before){params.push(before);where.push(`coalesce(g.paid_at,g.created_at)<($${params.length}::timestamptz + interval '1 day')`)}
  const rows=(await db.query(
    `select g.id,g.invoice_id,g.patient_id,g.gateway,g.amount_inr,g.currency,g.status,
      g.provider_order_id,g.provider_payment_id,g.paid_at,g.created_at,
      i.invoice_no,p.full_name patient_name,p.uhid
     from hospital_gateway_payments g
     left join invoices i on i.id=g.invoice_id
     left join patients p on p.id=g.patient_id
     where ${where.join(' and ')}
     order by coalesce(g.paid_at,g.created_at) desc
     limit 500`,params)).rows
  const stats=(await db.query(
    `select count(*)::int as total,
      count(*) filter (where status='created')::int as created,
      count(*) filter (where status in ('captured','authorized'))::int as paid,
      count(*) filter (where status='failed')::int as failed,
      coalesce(sum(amount_inr) filter (where status in ('captured','authorized')),0)::numeric as paid_inr
     from hospital_gateway_payments where hospital_id=$1`,[ctx.hospitalId])).rows[0]
  return {payments:rows,stats,gateway:await getHospitalGatewayView(db,ctx)}
}
