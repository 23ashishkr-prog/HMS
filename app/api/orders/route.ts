import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {orderTest,worklist} from '@/lib/services/diagnostics'
export const GET=api(async(c,db,r)=>({orders:await worklist(db,c,{category:qs(r,'category')||undefined,status:qs(r,'status')||undefined,patientId:qs(r,'patientId')||undefined})}),{module:'lab'})
export const POST=api(async(c,db,r)=>({order:await orderTest(db,c,await body(r))}),{module:'lab'})
