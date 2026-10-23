import {platformApi,body} from '@/lib/api'
import {getGatewayView,saveGateway,clearGateway} from '@/lib/services/platformGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=platformApi(async(db)=>getGatewayView(db))
export const PUT=platformApi(async(db,req,_p,plat)=>{
 const b=await body(req)
 if(b?.clear===true)return clearGateway(db,plat.id)
 return saveGateway(db,plat.id,b)
})
