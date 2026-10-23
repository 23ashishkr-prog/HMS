import {api} from '@/lib/api'
import {listHospitalGatewayPayments} from '@/lib/services/hospitalGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db,req)=>{
 const u=new URL(req.url)
 return listHospitalGatewayPayments(db,c,{
  q:u.searchParams.get('q')||'',
  status:u.searchParams.get('status')||'',
  after:u.searchParams.get('after')||'',
  before:u.searchParams.get('before')||'',
 })
})
