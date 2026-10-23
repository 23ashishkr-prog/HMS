import {NextResponse} from 'next/server'
import {getDb} from '@/lib/db'
import {fail} from '@/lib/api'
import {applyProviderEvent} from '@/lib/services/tenancy'
import {verifyWebhookSignature} from '@/lib/services/razorpay'
import {Db} from '@/lib/services/core'
export const runtime='nodejs'
/** Razorpay webhook. Uses platform-stored keys (preferred) or RAZORPAY_* env.
 *  Handles payment.captured / order.paid / payment.failed and subscription.* events.
 *  Expects notes.hospital_id + notes.plan_code (+ notes.billing_period) on the order/payment. */
export async function POST(req:Request){
 try{
  const db=getDb() as unknown as Db
  const raw=await req.text()
  const sig=req.headers.get('x-razorpay-signature')||''
  await verifyWebhookSignature(db,raw,sig)
  const ev=JSON.parse(raw)
  const pay=ev?.payload?.payment?.entity||{}
  const ord=ev?.payload?.order?.entity||{}
  const sub=ev?.payload?.subscription?.entity||{}
  const notes=pay.notes||ord.notes||sub.notes||{}
  const hid=notes.hospital_id||sub?.notes?.hospital_id
  if(!hid)return NextResponse.json({ok:true,ignored:'no hospital_id'})
  const amountInr=pay.amount!=null?Number(pay.amount)/100:(ord.amount!=null?Number(ord.amount)/100:undefined)
  await applyProviderEvent(db,hid,{
   type:ev.event,
   planCode:notes.plan_code||sub.notes?.plan_code,
   period:notes.billing_period||notes.period,
   periodEnd:sub.current_end?new Date(sub.current_end*1000).toISOString():undefined,
   subscriptionId:sub.id,
   customerId:sub.customer_id||pay.customer_id,
   paymentId:pay.id,
   orderId:pay.order_id||ord.id,
   amountInr,
  },ev)
  return NextResponse.json({ok:true})
 }catch(e){return fail(e)}
}
