import {api,body} from '@/lib/api';import * as A from '@/lib/ai/assistant';export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r,p)=>{const b=await body(r);return A.decide(db,c,p.id,b as any)})
