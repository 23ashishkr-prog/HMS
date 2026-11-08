import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listMessages} from '@/lib/services/nhcx'
export const GET=api(async(c,db,r)=>({messages:await listMessages(db,c,qs(r,'entity')||'',qs(r,'entityId')||'')}),{module:'insurance'})
