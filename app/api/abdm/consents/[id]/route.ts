import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {consentAction,consentDetail} from '@/lib/services/abdm'
export const GET=api(async(c,db,_r,p)=>consentDetail(db,c,p.id),{module:'patients'})
export const POST=api(async(c,db,r,p)=>consentAction(db,c,p.id,await body(r)),{module:'patients'})
