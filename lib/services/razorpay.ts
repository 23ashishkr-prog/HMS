/** Razorpay Orders + signature verify. Dry-run when keys missing — never fake success. */
import {createHmac,timingSafeEqual} from 'crypto'
import {HttpError} from '@/lib/services/core'
import {PLAN_ANNUAL_INR,PLAN_NAME,PLAN_PRICE_INR,PlanCode,canonicalPlan} from '@/lib/plans'
import {paymentsConfigured} from '@/lib/services/tenancy'

export type BillingPeriod='monthly'|'annual'
export function paymentsReady(){return paymentsConfigured()}
export function razorpayKeyId(){return process.env.RAZORPAY_KEY_ID||''}

export function planAmountInr(plan:PlanCode,period:BillingPeriod){
 return period==='annual'?PLAN_ANNUAL_INR[plan]:PLAN_PRICE_INR[plan]
}
export function periodEndIso(period:BillingPeriod,from=new Date()){
 const d=new Date(from);if(period==='annual')d.setFullYear(d.getFullYear()+1);else d.setMonth(d.getMonth()+1);return d.toISOString()
}

async function rzp(path:string,method:'GET'|'POST',body?:unknown){
 const id=process.env.RAZORPAY_KEY_ID,sec=process.env.RAZORPAY_KEY_SECRET
 if(!id||!sec)throw new HttpError(503,'Razorpay is not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.')
 const auth=Buffer.from(`${id}:${sec}`).toString('base64')
 const r=await fetch('https://api.razorpay.com/v1'+path,{method,headers:{Authorization:'Basic '+auth,'Content-Type':'application/json',...(body?{}:{})},body:body?JSON.stringify(body):undefined})
 const j=await r.json().catch(()=>({}))
 if(!r.ok)throw new HttpError(502,typeof j?.error?.description==='string'?j.error.description:('Razorpay error '+r.status))
 return j
}

export async function createPlanOrder(opts:{hospitalId:string;hospitalCode:string;planCode:string;period:BillingPeriod;adminEmail?:string|null}){
 if(!paymentsConfigured())throw new HttpError(503,'Online payments are not configured yet. Ask the platform owner to set Razorpay keys, or renew offline.')
 const plan=canonicalPlan(opts.planCode)
 const period=opts.period==='annual'?'annual':'monthly'
 const amountInr=planAmountInr(plan,period)
 const amount=Math.round(amountInr*100) // paise
 if(amount<100)throw new HttpError(400,'Invalid amount')
 const receipt=('hms_'+opts.hospitalCode+'_'+Date.now()).slice(0,40)
 const notes={hospital_id:opts.hospitalId,hospital_code:opts.hospitalCode,plan_code:plan,billing_period:period,product:'hms_plan'}
 const order=await rzp('/orders','POST',{amount,currency:'INR',receipt,notes,payment_capture:1})
 return {
  orderId:order.id as string,
  amount:amountInr,
  amountPaise:amount,
  currency:'INR',
  keyId:razorpayKeyId(),
  planCode:plan,
  planName:PLAN_NAME[plan],
  period,
  description:`PMS ${PLAN_NAME[plan]} · ${period}`,
  prefillEmail:opts.adminEmail||undefined,
 }
}

export function verifyCheckoutSignature(orderId:string,paymentId:string,signature:string){
 const sec=process.env.RAZORPAY_KEY_SECRET
 if(!sec)throw new HttpError(503,'Razorpay secret missing')
 const exp=createHmac('sha256',sec).update(orderId+'|'+paymentId).digest('hex')
 const a=Buffer.from(exp),b=Buffer.from(String(signature||''))
 if(a.length!==b.length||!timingSafeEqual(a,b))throw new HttpError(401,'Invalid payment signature')
 return true
}

export async function fetchOrder(orderId:string){return rzp('/orders/'+encodeURIComponent(orderId),'GET')}
