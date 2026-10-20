import {api,body} from '@/lib/api';import {labKeyInfo,rotateLabKey} from '@/lib/services/labimport';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>labKeyInfo(db,c),{module:'lab'})
export const POST=api(async(c,db,r)=>{const b:any=await body(r);return rotateLabKey(db,c,!!b.revoke)},{module:'lab'})
