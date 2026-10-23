import {api,body} from '@/lib/api'
import {HttpError,requireRole} from '@/lib/services/core'
import {createPlanOrder,paymentsReady} from '@/lib/services/razorpay'
import {PLAN_CATALOGUE} from '@/lib/plans'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Create a Razorpay order for Clinic / Basic / AI+ (monthly or annual). 503 with clear message when keys missing — never fakes success. */
export const POST=api(async(c,db,req)=>{
 requireRole(c,['admin'])
 if(!paymentsReady())throw new HttpError(503,'Online payments are not configured yet. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET on the deployment.')
 const b=await body(req)
 const period=b.period==='annual'?'annual':'monthly'
 const h=(await db.query('select id,code,contact_email from hospitals where id=$1',[c.hospitalId])).rows[0]
 const u=(await db.query('select email from users where id=$1',[c.userId])).rows[0]
 const order=await createPlanOrder({hospitalId:c.hospitalId,hospitalCode:h.code,planCode:String(b.planCode||'basic'),period,adminEmail:u?.email||h.contact_email})
 return {paymentsEnabled:true,catalogue:PLAN_CATALOGUE,...order}
},{allowOnHold:true})
