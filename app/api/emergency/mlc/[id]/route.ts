import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {HttpError} from '@/lib/services/core';import {getMlc,amendMlc,recordIntimation,setMlcStatus} from '@/lib/services/emergency'
export const GET=api(async(c,db,_r,p)=>getMlc(db,c,p.id),{module:'opd'})
/** MLCs are never deleted: amend (with reason), record the police intimation, or close / reopen. */
export const PATCH=api(async(c,db,r,p)=>({mlc:await amendMlc(db,c,p.id,await body(r))}),{module:'opd'})
export const POST=api(async(c,db,r,p)=>{const b=await body(r);if(b.action==='intimation')return {mlc:await recordIntimation(db,c,p.id,b)};if(b.action==='status')return {mlc:await setMlcStatus(db,c,p.id,b)};throw new HttpError(400,'Unknown action.')},{module:'opd'})
