import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {advanceOrder} from '@/lib/services/diagnostics'
export const PATCH=api(async(c,db,r,p)=>({order:await advanceOrder(db,c,p.id,await body(r))}),{module:'lab'})
