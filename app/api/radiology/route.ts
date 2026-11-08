import {api,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {radiologyWorklist} from '@/lib/services/radiology'
export const GET=api(async(c,db,r)=>({studies:await radiologyWorklist(db,c,{modality:qs(r,'modality')||undefined,status:qs(r,'status')||undefined,patientId:qs(r,'patientId')||undefined})}),{module:'lab'})
