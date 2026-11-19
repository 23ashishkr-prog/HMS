import {api,body} from '@/lib/api'
import {HttpError,requireRole} from '@/lib/services/core'
import {createPlanOrder,paymentsReadyDb} from '@/lib/services/razorpay'
import {PLAN_CATALOGUE} from '@/lib/plans'
import {assertTermsAgreed} from '@/lib/terms'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Create a Razorpay order for Clinic / Basic / AI+ (monthly or annual). 503 when keys missing — never fakes success. */
export const POST=api(async(c,db,req)=>{
 requireRole(c,['admin'])
 if(!(await paymentsReadyDb(db)))throw new HttpError(503,'Online payments are not configured yet. The platform owner must set Razorpay keys in Platform → Gateway settings (or RAZORPAY_* env).')
 const b=await body(req)
 const agreed=assertTermsAgreed(b)
 const period=b.period==='annual'?'annual':'monthly'
 const [h,u]=await Promise.all([
  db.query('select id,code,contact_email from hospitals where id=$1',[c.hospitalId]).then(r=>r.rows[0]),
  db.query('select email from users where id=$1',[c.userId]).then(r=>r.rows[0]),
 ])
 await db.query('update subscriptions set terms_version=$2,terms_agreed_at=$3,updated_at=now() where hospital_id=$1',[c.hospitalId,agreed.version,agreed.agreedAt])
 const order=await createPlanOrder(db,{hospitalId:c.hospitalId,hospitalCode:h.code,planCode:String(b.planCode||'basic'),period,adminEmail:u?.email||h.contact_email,termsVersion:agreed.version,termsAgreedAt:agreed.agreedAt})
 return {paymentsEnabled:true,catalogue:PLAN_CATALOGUE,...order}
},{allowOnHold:true})
