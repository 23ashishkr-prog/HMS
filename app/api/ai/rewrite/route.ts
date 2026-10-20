import {api,body} from '@/lib/api';import * as A from '@/lib/ai/assistant';export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r)=>{const b=await body(r);return A.rewriteForPatient(db,c,String(b.patientId||''),String(b.text||''),b.lang==='hi'?'hi':'en')})
