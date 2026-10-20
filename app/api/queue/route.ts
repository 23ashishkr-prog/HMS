import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {checkIn,listQueue} from '@/lib/services/opd';import {today} from '@/lib/services/core'
export const GET=api(async(c,db,r)=>({queue:await listQueue(db,c,qs(r,'date')||today()),doctors:(await db.query("select id,full_name from users where hospital_id=$1 and role='doctor' and active order by full_name",[c.hospitalId])).rows}),{module:'queue'})
export const POST=api(async(c,db,r)=>({token:await checkIn(db,c,await body(r))}),{module:'queue'})
