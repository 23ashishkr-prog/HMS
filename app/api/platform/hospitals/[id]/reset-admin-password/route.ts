import {platformApi,body} from '@/lib/api'
import {HttpError} from '@/lib/services/core'
import {platformResetAdminPassword,platformListHospitalAdmins} from '@/lib/services/tenancy'
import {partnerOf,partnerLabel,runPartner,smartshopAdmins,smartshopResetAdmin} from '@/lib/services/taildesk'
export const runtime='nodejs';export const dynamic='force-dynamic'
const partner=(req:Request)=>partnerOf(new URL(req.url).searchParams.get('product'))
const noWrite=(pp:'taildesk'|'smartshop')=>{throw new HttpError(400,runPartner(pp,()=>partnerLabel())+' is read-only in this console.')}
/** Platform owner: list admins (GET) or set a one-time temporary password (POST). Password is returned once in the JSON body — never e-mailed. Smart Shop owners are reset through Smart Shop's platform API. */
export const GET=platformApi(async(db,req,p)=>{
 const pp=partner(req)
 if(pp==='smartshop') return runPartner(pp,()=>smartshopAdmins(p.id))
 if(pp) return noWrite(pp)
 return platformListHospitalAdmins(db,p.id)
})
export const POST=platformApi(async(db,req,p,_plat)=>{
 const b=await body(req)
 const pp=partner(req)
 if(pp==='smartshop') return runPartner(pp,()=>smartshopResetAdmin(p.id,b))
 if(pp) return noWrite(pp)
 return platformResetAdminPassword(db,p.id,b,_plat)
})
