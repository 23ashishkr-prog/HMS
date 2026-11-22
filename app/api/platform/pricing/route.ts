import {platformApi,body} from '@/lib/api'
import {getCatalog,listOffers,priceLog,setPrice} from '@/lib/services/productPricing'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Price book for the platform console: today's prices, every running or upcoming offer, recent changes. */
export const GET=platformApi(async(db)=>{
 const [catalog,offers,log]=await Promise.all([getCatalog(db),listOffers(db),priceLog(db)])
 return {catalog,offers,log}
})
/** {product, planCode, monthlyInr} */
export const PUT=platformApi(async(db,req,_p,plat)=>{
 const b=await body(req)
 await setPrice(db,b,plat)
 const [catalog,offers,log]=await Promise.all([getCatalog(db),listOffers(db),priceLog(db)])
 return {catalog,offers,log}
})
