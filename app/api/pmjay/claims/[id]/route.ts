import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {updateSchemeClaim} from '@/lib/services/pmjay';import {submitClaim} from '@/lib/services/nhcx'
export const PATCH=api(async(c,db,r,p)=>({claim:await updateSchemeClaim(db,c,p.id,await body(r))}),{module:'insurance'})
export const POST=api(async(c,db,r,p)=>submitClaim(db,c,p.id),{module:'insurance'})
