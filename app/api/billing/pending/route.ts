import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {unbilledCharges,autoBill} from '@/lib/services/flows'
export const GET=api(async(c,db,r)=>({charges:await unbilledCharges(db,c,qs(r,'patientId'))}),{module:'billing'})
export const POST=api(async(c,db,r)=>{const b=await body(r);return autoBill(db,c,b.patientId)},{module:'billing',idempotent:true})
