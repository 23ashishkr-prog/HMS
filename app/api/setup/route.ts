import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {setupStatus,applyDefaults} from '@/lib/services/setup'
export const GET=api(async(c,db)=>setupStatus(db,c))
export const POST=api(async(c,db,r)=>{const b:any=await body(r);return applyDefaults(db,c,String(b.what||''))})
