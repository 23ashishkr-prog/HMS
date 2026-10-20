import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {setStaffActive} from '@/lib/services/tenancy'
export const PATCH=api(async(c,db,r,p)=>{const b=await body(r);await setStaffActive(db,c,p.id,!!b.active)})
