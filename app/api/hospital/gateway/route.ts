import {api,body} from '@/lib/api'
import {clearHospitalGateway,getHospitalGatewayView,saveHospitalGateway} from '@/lib/services/hospitalGateway'
export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>getHospitalGatewayView(db,c))
export const PUT=api(async(c,db,req)=>{
 const b=await body(req)
 if(b?.clear===true)return clearHospitalGateway(db,c)
 return saveHospitalGateway(db,c,b)
})
