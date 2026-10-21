import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {resetStaffPassword} from '@/lib/services/tenancy'
/** Admin sets a temporary password for a user in the same hospital; the user must change it at next login. Audited. */
export const PUT=api(async(c,db,r,p)=>{const b:any=await body(r);return resetStaffPassword(db,c,(await p).id,b.password)})
