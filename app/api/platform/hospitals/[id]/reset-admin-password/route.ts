import {platformApi,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {platformResetAdminPassword,platformListHospitalAdmins} from '@/lib/services/tenancy'
import {isTailDeskProduct,taildeskAdmins,taildeskResetAdmin} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Platform owner: list hospital admins (GET) or set a one-time temporary password (POST). Password is returned once in the JSON body — never e-mailed to chat. */
export const GET=platformApi(async(db,req,p)=>{
 if(isTailDeskProduct(new URL(req.url).searchParams.get('product'))) return taildeskAdmins(p.id)
 return platformListHospitalAdmins(db,p.id)
})
export const POST=platformApi(async(db,req,p,_plat)=>{
 const b=await body(req)
 if(isTailDeskProduct(new URL(req.url).searchParams.get('product'))) return taildeskResetAdmin(p.id,b)
 return platformResetAdminPassword(db,p.id,b,_plat)
})
