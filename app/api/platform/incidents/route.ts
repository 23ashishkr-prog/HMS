import {platformApi,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {listPlatformIncidents} from '@/lib/services/tickets'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,req)=>{
 const kind=new URL(req.url).searchParams.get('kind')||'all'
 const incidents=await listPlatformIncidents(db,{kind})
 return {
  incidents,
  configured:{github:!!process.env.GITHUB_ISSUES_TOKEN,email:!!(process.env.RESEND_API_KEY&&process.env.TECH_ALERT_EMAIL&&process.env.EMAIL_FROM)},
  sources:{
   errors:'Automatic capture of app (server/client) errors. Fingerprinted, scrubbed of PHI/secrets; optional GitHub issue / tech e-mail.',
   tickets:'Hospital-admin “Raise ticket” reports from Settings → Support.',
  },
 }
})
export const PATCH=platformApi(async(db,req)=>{
 const b=await body(req)
 if(!['open','acknowledged','resolved','ignored'].includes(b.status))throw new HttpError(400,'Invalid status.')
 const r=await db.query('update incidents set status=$2 where id=$1 returning id,status',[b.id,b.status])
 if(!r.rows[0])throw new HttpError(404,'Incident not found.')
 return {incident:r.rows[0]}
})
