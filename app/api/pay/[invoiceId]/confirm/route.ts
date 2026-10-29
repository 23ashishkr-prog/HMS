import {getDb} from '@/lib/db'
import {fail} from '@/lib/api'
import {publicConfirmPayment} from '@/lib/services/hospitalGateway'
import {Db} from '@/lib/services/core'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(req:Request,ext:{params:Promise<{invoiceId:string}>}){
 try{
  const {invoiceId}=await ext.params
  const b=await req.json().catch(()=>({}))
  return Response.json(await publicConfirmPayment(getDb() as unknown as Db,invoiceId,b))
 }catch(e){return fail(e)}
}
