import {platformApi} from '@/lib/api'
import {endOffer,getCatalog,listOffers,priceLog} from '@/lib/services/productPricing'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** End an offer now. */
export const DELETE=platformApi(async(db,_req,params,plat)=>{
 await endOffer(db,params?.id,plat)
 const [catalog,offers,log]=await Promise.all([getCatalog(db),listOffers(db),priceLog(db)])
 return {catalog,offers,log}
})
