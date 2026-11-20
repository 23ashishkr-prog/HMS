import {NextResponse} from 'next/server'
import {getDb} from '@/lib/db'
import {getRazorpayCreds} from '@/lib/services/platformGateway'
import {partnerFromRequest} from '@/lib/services/partnerKeys'
import type {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** TailDesk (PetCare) and Smart Shop charge their own customers through the Razorpay account set in Platform → Gateway.
 *  Only those servers may read it, each with its own shared platform key. */
export async function GET(req:Request){
 if(!partnerFromRequest(req))return NextResponse.json({error:'Not authorised.'},{status:401})
 const c=await getRazorpayCreds(getDb() as unknown as Db)
 if(!c.configured)return NextResponse.json({configured:false})
 return NextResponse.json({configured:true,mode:c.mode,keyId:c.keyId,keySecret:c.keySecret,webhookSecret:c.webhookSecret},{headers:{'Cache-Control':'no-store'}})
}
