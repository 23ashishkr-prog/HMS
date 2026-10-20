import {api,body} from '@/lib/api';import {listTemplates,saveTemplate} from '@/lib/services/templates';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>({templates:await listTemplates(db,c)}),{module:'opd'})
export const POST=api(async(c,db,r)=>saveTemplate(db,c,await body(r)),{module:'opd',idempotent:true})
