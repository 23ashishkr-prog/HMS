import {platformApi,body} from '@/lib/api'
import {createOffer,getCatalog,listOffers,priceLog} from '@/lib/services/productPricing'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** {product, planCode?, percent, label?, startsOn, endsOn} */
export const POST=platformApi(async(db,req,_p,plat)=>{
 await createOffer(db,await body(req),plat)
 const [catalog,offers,log]=await Promise.all([getCatalog(db),listOffers(db),priceLog(db)])
 return {catalog,offers,log}
})
