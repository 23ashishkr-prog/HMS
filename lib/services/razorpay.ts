/** Razorpay Orders + signature verify. Dry-run when keys missing — never fake success.
 *  Credentials: platform_settings (encrypted) preferred, else RAZORPAY_* env. */
import {createHmac,timingSafeEqual} from 'crypto'
import {Db,HttpError} from '@/lib/services/core'
import {PLAN_ANNUAL_INR,PLAN_NAME,PLAN_PRICE_INR,PlanCode,canonicalPlan} from '@/lib/plans'
import {envPaymentsConfigured,getRazorpayCreds,RzpCreds} from '@/lib/services/platformGateway'

export type BillingPeriod='monthly'|'annual'
/** Sync env-only; prefer paymentsReady(db) in routes. */
export function paymentsReady(){return envPaymentsConfigured()}
export async function paymentsReadyDb(db:Db){return (await getRazorpayCreds(db)).configured}
export async function razorpayKeyId(db:Db){return (await getRazorpayCreds(db)).keyId}

export function planAmountInr(plan:PlanCode,period:BillingPeriod){
 return period==='annual'?PLAN_ANNUAL_INR[plan]:PLAN_PRICE_INR[plan]
}
export function periodEndIso(period:BillingPeriod,from=new Date()){
 const d=new Date(from);if(period==='annual')d.setFullYear(d.getFullYear()+1);else d.setMonth(d.getMonth()+1);return d.toISOString()
}

async function rzp(creds:RzpCreds,path:string,method:'GET'|'POST',body?:unknown){
 if(!creds.configured)throw new HttpError(503,'Razorpay is not configured. Add keys in Platform → Gateway settings, or set RAZORPAY_* env vars.')
 const auth=Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')
 const r=await fetch('https://api.razorpay.com/v1'+path,{method,headers:{Authorization:'Basic '+auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
 const j=await r.json().catch(()=>({}))
 if(!r.ok)throw new HttpError(502,typeof j?.error?.description==='string'?j.error.description:('Razorpay error '+r.status))
 return j
}

export async function createPlanOrder(db:Db,opts:{hospitalId:string;hospitalCode:string;planCode:string;period:BillingPeriod;adminEmail?:string|null}){
 const creds=await getRazorpayCreds(db)
 if(!creds.configured)throw new HttpError(503,'Online payments are not configured yet. Ask the platform owner to set Razorpay keys in /platform/settings, or renew offline.')
 const plan=canonicalPlan(opts.planCode)
 const period=opts.period==='annual'?'annual':'monthly'
 const amountInr=planAmountInr(plan,period)
 const amount=Math.round(amountInr*100) // paise
 if(amount<100)throw new HttpError(400,'Invalid amount')
 const receipt=('hms_'+opts.hospitalCode+'_'+Date.now()).slice(0,40)
 const notes={hospital_id:opts.hospitalId,hospital_code:opts.hospitalCode,plan_code:plan,billing_period:period,product:'hms_plan'}
 const order=await rzp(creds,'/orders','POST',{amount,currency:'INR',receipt,notes,payment_capture:1})
 // Ledger row (created) so platform Payment check shows the attempt before capture
 try{
  await db.query(
   `insert into subscription_payments(hospital_id,plan_code,billing_period,amount_inr,amount_in_inr,currency,status,provider,provider_order_id,raw)
    values($1,$2,$3,$4,$4,'INR','created','razorpay',$5,$6)`,
   [opts.hospitalId,plan,period,amountInr,order.id,JSON.stringify({order,notes})]
  )
 }catch{/* non-fatal */}
 return {
  orderId:order.id as string,
  amount:amountInr,
  amountPaise:amount,
  currency:'INR',
  keyId:creds.keyId,
  planCode:plan,
  planName:PLAN_NAME[plan],
  period,
  description:`HMS ${PLAN_NAME[plan]} · ${period}`,
  prefillEmail:opts.adminEmail||undefined,
  mode:creds.mode,
 }
}

export async function verifyCheckoutSignature(db:Db,orderId:string,paymentId:string,signature:string){
 const creds=await getRazorpayCreds(db)
 if(!creds.keySecret)throw new HttpError(503,'Razorpay secret missing')
 const exp=createHmac('sha256',creds.keySecret).update(orderId+'|'+paymentId).digest('hex')
 const a=Buffer.from(exp),b=Buffer.from(String(signature||''))
 if(a.length!==b.length||!timingSafeEqual(a,b))throw new HttpError(401,'Invalid payment signature')
 return true
}

export async function fetchOrder(db:Db,orderId:string){
 const creds=await getRazorpayCreds(db)
 return rzp(creds,'/orders/'+encodeURIComponent(orderId),'GET')
}

export async function verifyWebhookSignature(db:Db,raw:string,sig:string){
 const creds=await getRazorpayCreds(db)
 if(!creds.configured)throw new HttpError(503,'Payments not configured')
 const exp=createHmac('sha256',creds.webhookSecret).update(raw).digest('hex')
 if(sig.length!==exp.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(exp)))throw new HttpError(401,'Bad signature')
 return creds
}
