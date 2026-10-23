import {api,body} from '@/lib/api'
import {raiseTicket,listHospitalTickets} from '@/lib/services/tickets'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Hospital admin only: raise / list support tickets for this tenant. */
export const GET=api(async(c,db)=> ({tickets:await listHospitalTickets(db,c)}))
export const POST=api(async(c,db,r)=>{const b=await body(r);return raiseTicket(db,c,b)})
