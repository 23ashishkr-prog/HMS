import {getDb} from '@/lib/db'
import {fail} from '@/lib/api'
import {publicInvoiceCheckout,publicPayView} from '@/lib/services/hospitalGateway'
import {Db} from '@/lib/services/core'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(_req:Request,ext:{params:Promise<{invoiceId:string}>}){
 try{const {invoiceId}=await ext.params;return Response.json(await publicPayView(getDb() as unknown as Db,invoiceId))}
 catch(e){return fail(e)}
}
export async function POST(req:Request,ext:{params:Promise<{invoiceId:string}>}){
 try{
  const {invoiceId}=await ext.params
  const b=await req.json().catch(()=>({}))
  const amount=b?.amount==null||b?.amount===''?null:Number(b.amount)
  return Response.json(await publicInvoiceCheckout(getDb() as unknown as Db,invoiceId,amount))
 }catch(e){return fail(e)}
}
