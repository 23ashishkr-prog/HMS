import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {setMyPhoto} from '@/lib/services/tenancy'
export const PUT=api(async(c,db,r)=>setMyPhoto(db,c,(await body(r)).photoUrl),{allowOnHold:true})
