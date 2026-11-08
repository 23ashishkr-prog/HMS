import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listPreauths,createPreauth} from '@/lib/services/pmjay'
export const GET=api(async(c,db,r)=>({preauths:await listPreauths(db,c,qs(r,'status')||'')}),{module:'insurance'})
export const POST=api(async(c,db,r)=>({preauth:await createPreauth(db,c,await body(r))}),{module:'insurance',idempotent:true})
