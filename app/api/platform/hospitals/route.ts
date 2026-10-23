import {platformApi} from '@/lib/api'
import {platformListHospitals,platformHospitalStats} from '@/lib/services/tenancy'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db,req)=>{
 const u=new URL(req.url)
 const q={q:u.searchParams.get('q')||'',plan:u.searchParams.get('plan')||'',status:u.searchParams.get('status')||''}
 const [hospitals,stats]=await Promise.all([platformListHospitals(db,q),platformHospitalStats(db)])
 return {hospitals,stats,paymentsConfigured:!!(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET)}
})
