import {api} from '@/lib/api'
import {getSubscription,entitlements} from '@/lib/services/tenancy'
import {activeNotices} from '@/lib/services/lifecycle'
import {TRIAL_DAYS,PLAN_CATALOGUE} from '@/lib/plans'
import {paymentsConfiguredAsync} from '@/lib/services/platformGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>{
 const s=await getSubscription(db,c.hospitalId)
 const e=entitlements(s)
 return {
  plan:s?.plan_name,planCode:s?.plan_code,status:s?.lifecycle?.status||s?.status,lifecycle:s?.lifecycle,
  usable:!!s?.usable,role:c.role,notices:await activeNotices(db,c.hospitalId),modules:e.modules,entitlements:e,
  trialDays:TRIAL_DAYS(),
  plans:(await db.query('select code,name,monthly_price_inr,modules from plans where active order by sort')).rows,
  catalogue:PLAN_CATALOGUE,
  paymentsEnabled:await paymentsConfiguredAsync(db),
  billingPeriod:s?.billing_period||null,
  currentPeriodStart:s?.current_period_start||null,
  currentPeriodEnd:s?.current_period_end||null,
  trialEndsAt:s?.trial_ends_at||null,
  lastPaymentId:s?.last_payment_id||null,
 }
},{allowOnHold:true})
