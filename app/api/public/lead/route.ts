import {NextResponse} from 'next/server';import {getDb} from '@/lib/db';import {fail,body} from '@/lib/api';import {createLead} from '@/lib/services/leads';import {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function POST(req:Request){try{const ip=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim();return NextResponse.json(await createLead(getDb() as unknown as Db,await body(req),ip))}catch(e){return fail(e,{route:'/api/public/lead'})}}
