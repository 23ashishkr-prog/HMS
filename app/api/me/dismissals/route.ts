import {api,body} from '@/lib/api'
import {listDismissals,setDismissal} from '@/lib/services/dismissals'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>listDismissals(db,c))
export const PUT=api(async(c,db,r)=>setDismissal(db,c,await body(r)))
