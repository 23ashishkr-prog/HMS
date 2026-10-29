import {api,body} from '@/lib/api'
import {createInvoiceGatewayOrder} from '@/lib/services/hospitalGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r,p)=>{
 let b:any={}
 try{b=await body(r)}catch{b={}}
 const amount=b?.amount==null||b?.amount===''?null:Number(b.amount)
 return createInvoiceGatewayOrder(db,c,p.id,amount)
},{module:'billing',idempotent:true})
