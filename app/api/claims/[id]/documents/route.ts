import {api,body} from '@/lib/api';import {checklist,setDocument} from '@/lib/services/claimpacket';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db,r,p)=>checklist(db,c,p.id),{module:'insurance'})
export const PUT=api(async(c,db,r,p)=>setDocument(db,c,p.id,await body(r)),{module:'insurance'})
