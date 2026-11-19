import {NextResponse} from 'next/server'
import {getDb} from '@/lib/db'
import {fail,body,NO_STORE} from '@/lib/api'
import {ingestLead,secretsMatch} from '@/lib/services/leads'
import {Db} from '@/lib/services/core'

export const runtime='nodejs'
export const dynamic='force-dynamic'

/** greynova.in creates a lead with a shared secret. The header value is never logged. */
export async function POST(req:Request){
 try{
  const expected=process.env.LEAD_INGEST_SECRET||''
  const got=req.headers.get('x-lead-ingest-secret')||''
  if(!expected)return NextResponse.json({error:'Lead ingest is not configured.'},{status:503,headers:NO_STORE})
  if(!got||!secretsMatch(got,expected))return NextResponse.json({error:'Unauthorized'},{status:401,headers:NO_STORE})
  const ip=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim()
  const out=await ingestLead(getDb() as unknown as Db,await body(req),ip)
  return NextResponse.json(out,{headers:NO_STORE})
 }catch(e){return fail(e,{route:'/api/platform/leads/ingest'})}
}
