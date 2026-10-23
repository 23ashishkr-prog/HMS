import {api,body} from '@/lib/api'
import {HttpError,requireRole} from '@/lib/services/core'
import {fetchOrder,paymentsReadyDb,verifyCheckoutSignature} from '@/lib/services/razorpay'
import {activatePaidPlan} from '@/lib/services/tenancy'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Verify Razorpay checkout signature and activate the plan immediately (webhook is the backup). */
export const POST=api(async(c,db,req)=>{
 requireRole(c,['admin'])
 if(!(await paymentsReadyDb(db)))throw new HttpError(503,'Online payments are not configured yet.')
 const b=await body(req)
 const orderId=String(b.razorpay_order_id||b.orderId||'')
 const paymentId=String(b.razorpay_payment_id||b.paymentId||'')
 const signature=String(b.razorpay_signature||b.signature||'')
 if(!orderId||!paymentId||!signature)throw new HttpError(400,'Missing payment confirmation fields.')
 await verifyCheckoutSignature(db,orderId,paymentId,signature)
 const order=await fetchOrder(db,orderId)
 const notes=order?.notes||{}
 if(notes.hospital_id&&notes.hospital_id!==c.hospitalId)throw new HttpError(403,'Payment belongs to another hospital.')
 const plan=String(notes.plan_code||b.planCode||'basic')
 const period=notes.billing_period==='annual'?'annual':'monthly'
 const amountPaise=Number(order.amount||0); const amountInr=amountPaise?amountPaise/100:undefined
 const r=await activatePaidPlan(db,{hospitalId:c.hospitalId,planCode:plan,period,paymentId,orderId,amountInr,raw:{order,paymentId,signature},eventType:'checkout.confirmed',signatureOk:true})
 return r
},{allowOnHold:true})
