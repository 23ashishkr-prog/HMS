import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {getPreauth,updatePreauth,movePreauth} from '@/lib/services/pmjay';import {sendPreauth} from '@/lib/services/nhcx';import {HttpError} from '@/lib/services/core'
export const GET=api(async(c,db,r,p)=>getPreauth(db,c,p.id),{module:'insurance'})
export const PATCH=api(async(c,db,r,p)=>({preauth:await updatePreauth(db,c,p.id,await body(r))}),{module:'insurance'})
export const POST=api(async(c,db,r,p)=>{const b=await body(r);if(b.action==='send')return sendPreauth(db,c,p.id);if(b.action==='move')return {preauth:await movePreauth(db,c,p.id,b)};throw new HttpError(400,'Unknown action.')},{module:'insurance'})
