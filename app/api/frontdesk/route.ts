import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {frontDeskVisit,consultationFee} from '@/lib/services/flows';import {listQueue} from '@/lib/services/opd'
export const GET=api(async(c,db)=>({queue:await listQueue(db,c),doctors:(await db.query("select id,full_name from users where hospital_id=$1 and role='doctor' and active order by full_name",[c.hospitalId])).rows,fee:await consultationFee(db,c)}),{module:'queue'})
export const POST=api(async(c,db,r)=>frontDeskVisit(db,c,await body(r)),{module:'queue'})
