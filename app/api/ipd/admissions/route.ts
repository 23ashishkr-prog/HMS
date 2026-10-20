import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {admit,listAdmissions} from '@/lib/services/ipd'
export const GET=api(async(c,db,r)=>({admissions:await listAdmissions(db,c,qs(r,'status')||undefined)}),{module:'ipd'});export const POST=api(async(c,db,r)=>({admission:await admit(db,c,await body(r))}),{module:'ipd'})
