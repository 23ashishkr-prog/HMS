import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {createClaim,listClaims} from '@/lib/services/insurance'
export const GET=api(async(c,db)=>({claims:await listClaims(db,c)}),{module:'insurance'});export const POST=api(async(c,db,r)=>({claim:await createClaim(db,c,await body(r))}),{module:'insurance'})
