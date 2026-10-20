import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {registerPatient,searchPatients,updatePatient} from '@/lib/services/patients'
export const GET=api(async(c,db,r)=>({patients:await searchPatients(db,c,qs(r,'q')),role:c.role}),{module:'patients'})
export const POST=api(async(c,db,r)=>({patient:await registerPatient(db,c,await body(r))}),{module:'patients',idempotent:true})
export const PATCH=api(async(c,db,r)=>{const b=await body(r);return {patient:await updatePatient(db,c,b.id,b)}},{module:'patients'})
