import {api} from '@/lib/api'
import {createInvoiceGatewayOrder} from '@/lib/services/hospitalGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,_r,p)=>createInvoiceGatewayOrder(db,c,p.id),{module:'billing',idempotent:true})
