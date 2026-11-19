import {api} from '@/lib/api'
import {HttpError,requireRole} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Stop the next renewal. Access stays until the paid period ends. Only the new renewal clock then opens the export window. */
export const POST=api(async(c,db)=>{
 requireRole(c,['admin'])
 const r=await db.query(`update subscriptions set cancel_at_period_end=true,auto_renew=false,updated_at=now()
  where hospital_id=$1 and status='active' returning current_period_end,renewal_policy`,[c.hospitalId])
 if(!r.rows[0])throw new HttpError(400,'There is no active paid plan to cancel.')
 return {ok:true,until:r.rows[0].current_period_end,enforced:!!r.rows[0].renewal_policy}
},{allowOnHold:true})
