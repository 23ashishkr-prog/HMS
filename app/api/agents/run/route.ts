import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {runAgent} from '@/lib/agents/agents'
export const POST=api(async(c,db,r)=>{const b=await body(r);return {run:await runAgent(db,c,String(b.agent||''),{admissionId:b.admissionId},'manual')}})
