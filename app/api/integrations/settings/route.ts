import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listIntegrations,saveIntegration,disconnect,testIntegration} from '@/lib/services/integrations'
/** Admin-only. Secrets are write-only: responses carry masked values only. */
export const GET=api(async(c,db)=>listIntegrations(db,c))
export const POST=api(async(c,db,r)=>{const b:any=await body(r);if(b.action==='save')return saveIntegration(db,c,b.kind,b);if(b.action==='disconnect')return disconnect(db,c,b.kind);if(b.action==='test')return testIntegration(db,c,b.kind,b);return Response.json({error:'Unknown action'},{status:400})})
