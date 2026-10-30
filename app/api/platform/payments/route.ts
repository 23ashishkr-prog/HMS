import {platformApi} from '@/lib/api'
import {platformListAllPayments,platformPaymentStats} from '@/lib/services/tenancy'
import {paymentsConfiguredAsync} from '@/lib/services/platformGateway'
import {isTailDeskProduct,taildeskPayments} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,req)=>{
 const u=new URL(req.url)
 if(isTailDeskProduct(u.searchParams.get('product'))) return taildeskPayments(u.searchParams)
 const q={
  q:u.searchParams.get('q')||'',
  status:u.searchParams.get('status')||'',
  hospitalId:u.searchParams.get('hospitalId')||'',
  after:u.searchParams.get('after')||u.searchParams.get('from')||'',
  before:u.searchParams.get('before')||u.searchParams.get('to')||'',
 }
 const [payments,stats,configured]=await Promise.all([
  platformListAllPayments(db,q),
  platformPaymentStats(db),
  paymentsConfiguredAsync(db),
 ])
 return {payments,stats,paymentsConfigured:configured}
})
