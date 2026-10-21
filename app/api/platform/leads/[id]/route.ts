import {platformApi,body} from '@/lib/api';import {updateLead} from '@/lib/services/leads';export const runtime='nodejs';export const dynamic='force-dynamic'
export const PATCH=platformApi(async(db,req,p)=>updateLead(db,p.id,await body(req)))
