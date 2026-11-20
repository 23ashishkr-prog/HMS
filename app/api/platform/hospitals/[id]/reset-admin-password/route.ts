import {platformApi,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {platformResetAdminPassword,platformListHospitalAdmins} from '@/lib/services/tenancy'
import {partnerOf,partnerLabel,runPartner} from '@/lib/services/taildesk'
const readOnly=(req:Request)=>{const pp=partnerOf(new URL(req.url).searchParams.get('product'));if(pp)throw new HttpError(400,runPartner(pp,()=>partnerLabel())+' is read-only in this console.')}
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Platform owner: list hospital admins (GET) or set a one-time temporary password (POST). Password is returned once in the JSON body — never e-mailed to chat. */
export const GET=platformApi(async(db,req,p)=>{
 readOnly(req)
 return platformListHospitalAdmins(db,p.id)
})
export const POST=platformApi(async(db,req,p,_plat)=>{
 readOnly(req)
 const b=await body(req)
 return platformResetAdminPassword(db,p.id,b,_plat)
})
