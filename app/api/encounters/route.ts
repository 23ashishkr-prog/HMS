import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {startEncounter,patientHistory} from '@/lib/services/opd'
export const GET=api(async(c,db,r)=>({history:await patientHistory(db,c,qs(r,'patientId'))}),{module:'opd'})
export const POST=api(async(c,db,r)=>({encounter:await startEncounter(db,c,await body(r))}),{module:'opd',idempotent:true})
