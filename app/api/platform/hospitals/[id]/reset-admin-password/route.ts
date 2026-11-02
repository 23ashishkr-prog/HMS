import {platformApi,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {platformResetAdminPassword,platformListHospitalAdmins} from '@/lib/services/tenancy'
import {isTailDeskProduct} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Platform owner: list hospital admins (GET) or set a one-time temporary password (POST). Password is returned once in the JSON body — never e-mailed to chat. */
export const GET=platformApi(async(db,req,p)=>{
 if(isTailDeskProduct(new URL(req.url).searchParams.get('product'))) throw new HttpError(400,'TailDesk is read-only in this console.')
 return platformListHospitalAdmins(db,p.id)
})
export const POST=platformApi(async(db,req,p,_plat)=>{
 if(isTailDeskProduct(new URL(req.url).searchParams.get('product'))) throw new HttpError(400,'TailDesk is read-only in this console.')
 const b=await body(req)
 return platformResetAdminPassword(db,p.id,b,_plat)
})
