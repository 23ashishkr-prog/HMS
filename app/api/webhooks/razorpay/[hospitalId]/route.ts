/** Per-hospital Razorpay webhook — uses THAT hospital's webhook secret only (never platform SaaS keys). */
import {getDb} from '@/lib/db'
import {Db,HttpError} from '@/lib/services/core'
import {captureHospitalGatewayPayment,markHospitalGatewayFailed,verifyHospitalWebhookSignature} from '@/lib/services/hospitalGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function POST(req:Request,ext:{params:Promise<{hospitalId:string}>}){
 try{
  const {hospitalId}=await ext.params
  const raw=await req.text()
  const sig=req.headers.get('x-razorpay-signature')||''
  const db=getDb() as unknown as Db
  await verifyHospitalWebhookSignature(db,hospitalId,raw,sig)
  const evt=JSON.parse(raw)
  const type=String(evt?.event||'')
  const ent=evt?.payload?.payment?.entity||evt?.payload?.order?.entity||{}
  const notes=ent.notes||{}
  const hid=String(notes.hospital_id||hospitalId)
  if(hid!==hospitalId)throw new HttpError(400,'hospital_id mismatch')
  const orderId=ent.order_id||ent.id||null
  const paymentId=type.startsWith('payment.')?ent.id:ent.payment_id||null
  const amountInr=ent.amount!=null?Number(ent.amount)/100:null
  if(type==='payment.failed'){
   await markHospitalGatewayFailed(db,hospitalId,orderId,paymentId,evt)
   return Response.json({ok:true})
  }
  if(type==='payment.captured'||type==='order.paid'){
   await captureHospitalGatewayPayment(db,{hospitalId,orderId,paymentId,amountInr,signatureOk:true,raw:evt})
   return Response.json({ok:true})
  }
  return Response.json({ok:true,ignored:type})
 }catch(e:any){
  const status=e?.status||500
  return Response.json({error:String(e?.message||e).slice(0,200)},{status})
 }
}
