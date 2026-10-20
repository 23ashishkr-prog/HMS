import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {dispense} from '@/lib/services/pharmacy'
export const POST=api(async(c,db,r,p)=>{await dispense(db,c,p.id,await body(r))},{module:'pharmacy'})
