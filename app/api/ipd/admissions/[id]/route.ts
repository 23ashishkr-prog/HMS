import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {discharge,staffSummary} from '@/lib/services/ipd'
export const GET=api(async(c,db,_r,p)=>staffSummary(db,c,p.id),{module:'ipd'})
export const POST=api(async(c,db,r,p)=>({admission:await discharge(db,c,p.id,await body(r))}),{module:'ipd'})
