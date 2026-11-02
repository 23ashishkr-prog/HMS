import {platformApi,body} from '@/lib/api'
import {taildeskEmailView,saveTaildeskEmail,testTaildeskEmail} from '@/lib/services/platformEmail'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db)=>taildeskEmailView(db))
export const PUT=platformApi(async(db,req,_p,plat)=>saveTaildeskEmail(db,plat.id,await body(req)))
export const POST=platformApi(async(db,req)=>testTaildeskEmail(db,String((await body(req))?.to||'').trim()))
