import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {careContextAction,listCareContexts} from '@/lib/services/abdm'
export const GET=api(async(c,db,r)=>({careContexts:await listCareContexts(db,c,{patientId:qs(r,'patientId')||undefined,status:qs(r,'status')||undefined})}),{module:'patients'})
export const POST=api(async(c,db,r)=>careContextAction(db,c,await body(r)),{module:'patients'})
