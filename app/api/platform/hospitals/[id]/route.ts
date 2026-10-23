import {platformApi,body} from '@/lib/api'
import {platformHospitalDetail,platformSetSubscription} from '@/lib/services/tenancy'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,_req,p)=>platformHospitalDetail(db,p.id))
export const PATCH=platformApi(async(db,req,p)=>{
 const b=await body(req)
 return {subscription:await platformSetSubscription(db,p.id,b)}
})
