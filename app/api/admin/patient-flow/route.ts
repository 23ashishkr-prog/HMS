import {api,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {patientFlow} from '@/lib/services/patientflow'
export const GET=api(async(c,db,r)=>patientFlow(db,c,{from:qs(r,'from')||undefined,to:qs(r,'to')||undefined}))
