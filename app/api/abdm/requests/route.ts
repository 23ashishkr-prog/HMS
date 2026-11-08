import {api,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listRequests} from '@/lib/services/abdm'
export const GET=api(async(c,db,r)=>({requests:await listRequests(db,c,{status:qs(r,'status')||undefined,limit:Number(qs(r,'limit'))||100})}),{module:'patients'})
