/** ABDM gateway callbacks (bridge URL = <app>/api/abdm/callbacks). Public: no session. Verified by the gateway-signed JWT; the HIU
 *  data-push (/data-push/<transferId>) comes from another HIP, so it is accepted only for a pending transfer with a matching transaction id. */
import {NextResponse,after} from 'next/server';import {getDb} from '@/lib/db';import {Db} from '@/lib/services/core';import {handleCallback,receiveDataPush,verifyGatewayRequest} from '@/lib/services/abdm'
export const runtime='nodejs';export const dynamic='force-dynamic'
export async function POST(req:Request,ext:{params:Promise<{path:string[]}>}){const {path}=await ext.params;const raw=await req.text();if(raw.length>20_000_000)return NextResponse.json({error:'Payload too large'},{status:413});let body:any;try{body=raw?JSON.parse(raw):{}}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 const db=getDb() as unknown as Db;const h:Record<string,string>={};req.headers.forEach((v,k)=>{h[k.toLowerCase()]=v})
 try{if(path[0]==='data-push'){const r=await receiveDataPush(db,String(path[1]||''),body);return NextResponse.json(r,{status:202})}
  const v=await verifyGatewayRequest(h);if(!v.ok)return NextResponse.json({error:v.error},{status:v.status})
  // ABDM expects 202 straight away; the work (and our async reply to the gateway) runs after the response.
  const job=()=>handleCallback(db,'/'+path.join('/'),h,body).catch(e=>console.error('[abdm callback]',String(e?.message||e).slice(0,200)));try{after(job)}catch{await job()}
  return new NextResponse(null,{status:202})}
 catch(e:any){return NextResponse.json({error:String(e?.message||e).slice(0,200)},{status:e?.status||500})}}
