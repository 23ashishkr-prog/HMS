import {api,body} from '@/lib/api';import {staffBookFollowup} from '@/lib/services/patientcomms';export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r,p)=>({appointment:await staffBookFollowup(db,c,p.id,await body(r))}),{module:'appointments',idempotent:true})
