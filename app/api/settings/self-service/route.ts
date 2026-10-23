import {api,body} from '@/lib/api';import {selfServiceSettings} from '@/lib/services/selfservice';import {requireRole} from '@/lib/services/core';import QR from 'qrcode';import {basePath,withBase} from '@/lib/basePath';export const runtime='nodejs';export const dynamic='force-dynamic'
const originOf=(r:Request)=>{const raw=(process.env.APP_BASE_URL||new URL(r.url).origin).replace(/\/$/,'');return raw.endsWith(basePath)?raw.slice(0,-basePath.length):raw}
async function view(c:any,db:any,r:Request,b?:any){requireRole(c,['admin','reception']);const s=await selfServiceSettings(db,c,b);const url=`${originOf(r)}${withBase('/checkin/'+s.code)}?k=${s.key}`;const bookingUrl=`${originOf(r)}${withBase('/book/'+s.code)}`;return {...s,url,qrSvg:await QR.toString(url,{type:'svg',margin:1,width:320}),bookingUrl,bookingQrSvg:await QR.toString(bookingUrl,{type:'svg',margin:1,width:320})}}
export const GET=api(async(c,db,r)=>view(c,db,r))
export const PUT=api(async(c,db,r)=>view(c,db,r,await body(r)))
