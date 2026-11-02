import {NextResponse} from 'next/server'
import {timingSafeEqual} from 'crypto'
import {getDb} from '@/lib/db'
import {getTaildeskEmail} from '@/lib/services/platformEmail'
import type {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** TailDesk sends its own e-mail (sign-up codes, reminders) with the mailbox set in Platform → Settings. Only the TailDesk server may read it. */
export async function GET(req:Request){
 const key=(process.env.TAILDESK_PLATFORM_API_KEY||'').trim()
 const given=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim()||(req.headers.get('x-platform-api-key')||'').trim()
 const a=Buffer.from(given),b=Buffer.from(key)
 if(!key||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Not authorised.'},{status:401})
 const c=await getTaildeskEmail(getDb() as unknown as Db)
 if(!c.configured)return NextResponse.json({configured:false})
 return NextResponse.json({configured:true,fromEmail:c.fromEmail,fromName:c.fromName,host:c.host,port:c.port,username:c.username,password:c.password},{headers:{'Cache-Control':'no-store'}})
}
