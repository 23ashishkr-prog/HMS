import {platformApi} from '@/lib/api'
import {platformListHospitals,platformHospitalStats} from '@/lib/services/tenancy'
import {paymentsConfiguredAsync} from '@/lib/services/platformGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,req)=>{
 const u=new URL(req.url)
 const q={q:u.searchParams.get('q')||'',plan:u.searchParams.get('plan')||'',status:u.searchParams.get('status')||''}
 const [hospitals,stats,paymentsConfigured]=await Promise.all([
  platformListHospitals(db,q),
  platformHospitalStats(db),
  paymentsConfiguredAsync(db),
 ])
 return {hospitals,stats,paymentsConfigured}
})
