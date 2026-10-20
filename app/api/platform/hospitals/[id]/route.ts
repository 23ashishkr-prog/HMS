import {platformApi,body} from '@/lib/api';import {platformSetSubscription} from '@/lib/services/tenancy';export const runtime='nodejs'
export const PATCH=platformApi(async(db,req,p)=>({subscription:await platformSetSubscription(db,p.id,await body(req))}))
