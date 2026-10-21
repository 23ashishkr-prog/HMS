import {NextResponse} from 'next/server';import {getDb} from '@/lib/db';import {fail,body} from '@/lib/api';import {completeReset} from '@/lib/services/pwreset';import {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function POST(req:Request){try{const b=await body(req);return NextResponse.json(await completeReset(getDb() as unknown as Db,b.token,b.password))}catch(e){return fail(e,{route:'/api/auth/reset'})}}
