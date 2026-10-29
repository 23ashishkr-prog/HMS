import {api} from '@/lib/api'
import {getSubscription,entitlements} from '@/lib/services/tenancy'
import {activeNotices} from '@/lib/services/lifecycle'
import {TRIAL_DAYS,PLAN_CATALOGUE,aiFeaturesFor,canonicalPlan} from '@/lib/plans'
import {paymentsConfiguredAsync} from '@/lib/services/platformGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>{
 const s=await getSubscription(db,c.hospitalId)
 const e=entitlements(s)
 const month=new Date(Date.now()+330*60000).toISOString().slice(0,7)
 const usage=(await db.query('select tokens,calls from ai_usage where hospital_id=$1 and month=$2',[c.hospitalId,month])).rows[0]
 const cap=(await db.query('select ai_monthly_token_cap from hospitals where id=$1',[c.hospitalId])).rows[0]
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
  trialStartedAt:s?.lifecycle?.paid?null:s?.trial_started_at||null,
  trialEndsAt:s?.lifecycle?.paid?null:s?.lifecycle?.trialEndsAt||null,
  trialDaysLeft:s?.lifecycle?.paid?null:s?.lifecycle?.trialDaysLeft??null,
  aiFeatures:aiFeaturesFor(canonicalPlan(s?.plan_code)),
  aiUsage:{used:Number(usage?.tokens||0),calls:Number(usage?.calls||0),cap:Number(cap?.ai_monthly_token_cap||0)},
  lastPaymentId:s?.last_payment_id||null,
 }
},{allowOnHold:true})
