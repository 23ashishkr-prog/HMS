import {api,body} from '@/lib/api';import {selfServiceSettings} from '@/lib/services/selfservice';import {requireRole} from '@/lib/services/core';import QR from 'qrcode';export const runtime='nodejs';export const dynamic='force-dynamic'
const base=(r:Request)=>process.env.APP_BASE_URL||new URL(r.url).origin
async function view(c:any,db:any,r:Request,b?:any){requireRole(c,['admin','reception']);const s=await selfServiceSettings(db,c,b);const url=`${base(r)}/checkin/${s.code}?k=${s.key}`;const bookingUrl=`${base(r)}/book/${s.code}`;return {...s,url,qrSvg:await QR.toString(url,{type:'svg',margin:1,width:320}),bookingUrl,bookingQrSvg:await QR.toString(bookingUrl,{type:'svg',margin:1,width:320})}}
export const GET=api(async(c,db,r)=>view(c,db,r))
export const PUT=api(async(c,db,r)=>view(c,db,r,await body(r)))
