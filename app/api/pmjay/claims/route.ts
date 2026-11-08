import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listSchemeClaims,createSchemeClaim} from '@/lib/services/pmjay'
export const GET=api(async(c,db)=>({claims:await listSchemeClaims(db,c)}),{module:'insurance'})
export const POST=api(async(c,db,r)=>({claim:await createSchemeClaim(db,c,String((await body(r)).preauthId||''))}),{module:'insurance',idempotent:true})
