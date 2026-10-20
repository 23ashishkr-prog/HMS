import {api,body} from '@/lib/api';import {verifyImport} from '@/lib/services/labimport';export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r,p)=>verifyImport(db,c,p.id,await body(r) as any),{module:'lab',idempotent:true})
