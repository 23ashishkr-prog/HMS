import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {getAppearance,setMyAppearance} from '@/lib/services/appearance'
export const GET=api(async(c,db)=>getAppearance(db,c),{allowOnHold:true,allowPasswordChange:true})
export const PUT=api(async(c,db,r)=>setMyAppearance(db,c,await body(r)),{allowOnHold:true})
