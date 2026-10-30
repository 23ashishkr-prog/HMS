import {platformApi} from '@/lib/api'
import {platformListHospitals,platformHospitalStats,platformPaymentStats,platformListEvents} from '@/lib/services/tenancy'
import {paymentsConfiguredAsync} from '@/lib/services/platformGateway'
import {isTailDeskProduct,taildeskHospitalList} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,req)=>{
 const u=new URL(req.url)
 if(isTailDeskProduct(u.searchParams.get('product'))) return taildeskHospitalList(u.searchParams)
 const q={q:u.searchParams.get('q')||'',plan:u.searchParams.get('plan')||'',status:u.searchParams.get('status')||''}
 const [hospitals,stats,paymentsConfigured,revenue,events]=await Promise.all([
  platformListHospitals(db,q),
  platformHospitalStats(db),
  paymentsConfiguredAsync(db),
  platformPaymentStats(db),
  platformListEvents(db,{limit:20}),
 ])
 return {hospitals,stats,paymentsConfigured,revenue,events,product:'hms'}
})
