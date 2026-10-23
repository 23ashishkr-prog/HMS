import {platformApi,body} from '@/lib/api'
import {platformResetAdminPassword,platformListHospitalAdmins} from '@/lib/services/tenancy'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Platform owner: list hospital admins (GET) or set a one-time temporary password (POST). Password is returned once in the JSON body — never e-mailed to chat. */
export const GET=platformApi(async(db,_req,p)=>platformListHospitalAdmins(db,p.id))
export const POST=platformApi(async(db,req,p,_plat)=>{
 const b=await body(req)
 return platformResetAdminPassword(db,p.id,b,_plat)
})
