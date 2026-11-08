import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {otBoard,scheduleSurgery} from '@/lib/services/ot'
export const GET=api(async(c,db,r)=>otBoard(db,c,qs(r,'date')),{module:'ipd'})
export const POST=api(async(c,db,r)=>({surgery:await scheduleSurgery(db,c,await body(r))}),{module:'ipd',idempotent:true})
