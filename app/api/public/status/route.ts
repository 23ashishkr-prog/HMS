import {NextResponse} from 'next/server';import {getDb} from '@/lib/db';import {fail,body} from '@/lib/api';import {publicStatus} from '@/lib/services/assistant';import {Db} from '@/lib/services/core';export const runtime='nodejs'
export async function POST(req:Request){try{return NextResponse.json(await publicStatus(getDb() as unknown as Db,await body(req)))}catch(e){return fail(e)}}
