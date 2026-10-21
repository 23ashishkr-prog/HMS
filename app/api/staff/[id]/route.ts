import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {updateStaff} from '@/lib/services/tenancy'
export const PATCH=api(async(c,db,r,p)=>({user:await updateStaff(db,c,(await p).id,await body(r))}))
