import {api} from '@/lib/api'
import {getSubscription,entitlements} from '@/lib/services/tenancy'
import {paymentsConfiguredAsync} from '@/lib/services/platformGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>{
 const sub=await getSubscription(db,c.hospitalId)
 return {
  subscription:sub,
  entitlements:entitlements(sub),
  paymentsEnabled:await paymentsConfiguredAsync(db),
 }
},{allowOnHold:true})
