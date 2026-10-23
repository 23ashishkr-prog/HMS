import {NextResponse} from 'next/server'
import {createHmac,timingSafeEqual} from 'crypto'
import {getDb} from '@/lib/db'
import {fail} from '@/lib/api'
import {applyProviderEvent,paymentsConfigured} from '@/lib/services/tenancy'
import {Db} from '@/lib/services/core'
export const runtime='nodejs'
/** Razorpay webhook. Disabled (503) until RAZORPAY_* env vars are set.
 *  Handles payment.captured / order.paid (one-time plan checkout) and subscription.* events.
 *  Expects notes.hospital_id + notes.plan_code (+ notes.billing_period) on the order/payment. */
export async function POST(req:Request){
 try{
  if(!paymentsConfigured())return NextResponse.json({error:'Payments not configured'},{status:503})
  const raw=await req.text()
  const sig=req.headers.get('x-razorpay-signature')||''
  const exp=createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex')
  if(sig.length!==exp.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(exp)))return NextResponse.json({error:'Bad signature'},{status:401})
  const ev=JSON.parse(raw)
  const db=getDb() as unknown as Db
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
