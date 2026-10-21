import {NextResponse} from 'next/server';import {getDb} from '@/lib/db';import {fail,body} from '@/lib/api';import {requestReset} from '@/lib/services/pwreset';import {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function POST(req:Request){try{const b=await body(req);return NextResponse.json(await requestReset(getDb() as unknown as Db,b.email,b.hospitalCode))}catch(e){return fail(e,{route:'/api/auth/forgot'})}}
