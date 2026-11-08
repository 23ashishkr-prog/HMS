/** NHCX gateway callbacks (on_check / on_submit). Public: the payload is a JWE addressed to our participant code and decrypted with our key. */
import {NextResponse} from 'next/server';import {getDb} from '@/lib/db';import {Db,HttpError} from '@/lib/services/core';import {receiveCallback} from '@/lib/services/nhcx'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function POST(req:Request,ext:{params:Promise<{action:string[]}>}){try{const {action}=await ext.params;const r=await receiveCallback(getDb() as unknown as Db,'/'+(action||[]).join('/'),await req.json().catch(()=>({})));return NextResponse.json(r,{status:202})}
 catch(e:any){const s=e instanceof HttpError?e.status:400;return NextResponse.json({error:{code:'ERR_INVALID_PAYLOAD',message:e instanceof HttpError?e.message:'Invalid payload'}},{status:s})}}
