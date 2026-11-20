import {NextResponse} from 'next/server'
import {getDb} from '@/lib/db'
import {getTaildeskEmail} from '@/lib/services/platformEmail'
import {partnerFromRequest} from '@/lib/services/partnerKeys'
import type {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** TailDesk and Smart Shop send their own e-mail (sign-up codes, reminders) with the mailbox set in Platform → Settings.
 *  Only those servers may read it, each with its own shared platform key. */
export async function GET(req:Request){
 const who=partnerFromRequest(req)
 if(!who)return NextResponse.json({error:'Not authorised.'},{status:401})
 const c=await getTaildeskEmail(getDb() as unknown as Db)
 if(!c.configured)return NextResponse.json({configured:false})
 return NextResponse.json({configured:true,fromEmail:c.fromEmail,fromName:who==='smartshop'?'Smart Shop':c.fromName,host:c.host,port:c.port,username:c.username,password:c.password},{headers:{'Cache-Control':'no-store'}})
}
