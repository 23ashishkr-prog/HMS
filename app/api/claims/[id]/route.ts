import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {updateClaim} from '@/lib/services/insurance'
export const PATCH=api(async(c,db,r,p)=>({claim:await updateClaim(db,c,p.id,await body(r))}),{module:'insurance'})
