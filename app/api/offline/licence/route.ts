import {api} from '@/lib/api'
import {getSubscription} from '@/lib/services/tenancy'
import {issueLicence} from '@/lib/offlineLicence'
export const runtime='nodejs';export const dynamic='force-dynamic'
/**
 * Offline licence for this device. Called whenever the app is online: re-checks the plan with the same rule as every
 * other API (getSubscription().usable, and not read-only for an overdue renewal) and, if usable and the hospital is in "Offline mode", returns a licence signed
 * by the server that lets the desks keep working offline for the next 30 days. On hold → locked; Live mode → disabled.
 */
export const POST=api(async(c,db)=>{
 const [s,h]=await Promise.all([getSubscription(db,c.hospitalId),db.query('select offline_enabled from hospitals where id=$1',[c.hospitalId])])
 const r=issueLicence({hospitalId:c.hospitalId,userId:c.userId,usable:!!s?.usable&&!s?.readOnly,status:s?.lifecycle?.status||s?.status||'none',offlineEnabled:h.rows[0]?.offline_enabled!==false})
 if(r.ok)return {token:r.token,licence:r.licence,serverTime:r.serverTime}
 return 'locked' in r?{locked:true,status:r.status,serverTime:r.serverTime}:{disabled:true,serverTime:r.serverTime}
},{allowOnHold:true,allowPasswordChange:true})
