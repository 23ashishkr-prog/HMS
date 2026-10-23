import {api,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {captureHospitalGatewayPayment,verifyHospitalCheckoutSignature} from '@/lib/services/hospitalGateway'
import {getInvoice} from '@/lib/services/billing'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,req,p)=>{
 const b=await body(req)
 const orderId=String(b.razorpay_order_id||b.orderId||'')
 const paymentId=String(b.razorpay_payment_id||b.paymentId||'')
 const signature=String(b.razorpay_signature||b.signature||'')
 if(!orderId||!paymentId||!signature)throw new HttpError(400,'Missing Razorpay checkout fields')
 await verifyHospitalCheckoutSignature(db,c.hospitalId,orderId,paymentId,signature)
 await captureHospitalGatewayPayment(db,{
  hospitalId:c.hospitalId,orderId,paymentId,signatureOk:true,userId:c.userId,raw:b,
 })
 return getInvoice(db,c,p.id)
},{module:'billing',idempotent:true})
