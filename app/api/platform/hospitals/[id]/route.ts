import {platformApi,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {platformHospitalDetail,platformSetSubscription} from '@/lib/services/tenancy'
import {isTailDeskProduct,taildeskHospitalDetail} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,req,p)=>{
 if(isTailDeskProduct(new URL(req.url).searchParams.get('product'))) return taildeskHospitalDetail(p.id)
 return platformHospitalDetail(db,p.id)
})
export const PATCH=platformApi(async(db,req,p)=>{
 if(isTailDeskProduct(new URL(req.url).searchParams.get('product'))) throw new HttpError(400,'TailDesk is read-only in this console.')
 const b=await body(req)
 return {subscription:await platformSetSubscription(db,p.id,b)}
})
