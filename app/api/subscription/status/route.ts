import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic'
import {getSubscription,entitlements} from '@/lib/services/tenancy'
import {activeNotices} from '@/lib/services/lifecycle'
import {TRIAL_DAYS,PLAN_CATALOGUE} from '@/lib/plans'
export const GET=api(async(c,db)=>{const s=await getSubscription(db,c.hospitalId);const e=entitlements(s);return {plan:s?.plan_name,planCode:s?.plan_code,status:s?.lifecycle?.status||s?.status,lifecycle:s?.lifecycle,usable:!!s?.usable,role:c.role,notices:await activeNotices(db,c.hospitalId),modules:e.modules,entitlements:e,trialDays:TRIAL_DAYS(),plans:(await db.query('select code,name,monthly_price_inr,modules from plans where active order by sort')).rows,catalogue:PLAN_CATALOGUE,paymentsEnabled:!!process.env.RAZORPAY_KEY_ID}},{allowOnHold:true})
