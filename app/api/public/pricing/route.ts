import {NextResponse} from 'next/server'
import {getDb} from '@/lib/db'
import {Db} from '@/lib/services/core'
import {getCatalog,publicFeed} from '@/lib/services/productPricing'
export const runtime='nodejs';export const dynamic='force-dynamic'

/** Public price feed for greynova.in, TailDesk and Smart Shop. Read-only, no personal data.
 *  Cached for a minute at the edge so a price change or offer shows within about a minute. */
const HEADERS={
 'Cache-Control':'public, s-maxage=60, stale-while-revalidate=300',
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Methods':'GET, OPTIONS',
}
export async function GET(){
 let cat
 try{cat=await getCatalog(getDb() as unknown as Db)}
 catch{const {todayIst,DEFAULT_PRICES,priceRow,PRODUCTS,PRODUCT_NAME}=await import('@/lib/services/productPricing');const today=todayIst();cat={today,products:Object.fromEntries(PRODUCTS.map(p=>[p,{name:PRODUCT_NAME[p],plans:DEFAULT_PRICES[p].map(x=>priceRow(x,[],p,today))}]))} as any}
 return NextResponse.json(publicFeed(cat),{headers:HEADERS})
}
export function OPTIONS(){return new NextResponse(null,{status:204,headers:HEADERS})}
