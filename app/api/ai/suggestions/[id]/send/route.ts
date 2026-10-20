import {api,body} from '@/lib/api';import * as A from '@/lib/ai/assistant';export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r,p)=>A.sendAccepted(db,c,p.id),{idempotent:true})
