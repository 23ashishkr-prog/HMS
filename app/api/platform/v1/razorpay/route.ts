import {NextResponse} from 'next/server'
import {timingSafeEqual} from 'crypto'
import {getDb} from '@/lib/db'
import {getRazorpayCreds} from '@/lib/services/platformGateway'
import type {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** TailDesk (PetCare) charges its own hospitals through the Razorpay keys set in Platform → Settings.
 *  Only the TailDesk server may read them: it must present the shared platform API key. */
export async function GET(req:Request){
 const key=(process.env.TAILDESK_PLATFORM_API_KEY||'').trim()
 const given=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim()||(req.headers.get('x-platform-api-key')||'').trim()
 const a=Buffer.from(given),b=Buffer.from(key)
 if(!key||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Not authorised.'},{status:401})
 const c=await getRazorpayCreds(getDb() as unknown as Db)
 if(!c.configured)return NextResponse.json({configured:false})
 return NextResponse.json({configured:true,mode:c.mode,keyId:c.keyId,keySecret:c.keySecret,webhookSecret:c.webhookSecret},{headers:{'Cache-Control':'no-store'}})
}
