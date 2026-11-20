import {platformApi} from '@/lib/api'
import {platformListEvents} from '@/lib/services/tenancy'
import {partnerOf,runPartner,taildeskEvents} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Platform owner: subscription events for HMS (own DB) or TailDesk (its platform API). */
export const GET=platformApi(async(db,req)=>{
 const u=new URL(req.url)
 const pp=partnerOf(u.searchParams.get('product'));if(pp) return runPartner(pp,()=>taildeskEvents(u.searchParams))
 const events=await platformListEvents(db,{
  hospitalId:u.searchParams.get('hospitalId')||'',
  limit:u.searchParams.get('limit')||40,
 })
 return {product:'hms',configured:true,events}
})
