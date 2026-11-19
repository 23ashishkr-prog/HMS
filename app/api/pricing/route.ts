import {NextResponse} from 'next/server'
import {dailyRates,resolveDisplay} from '@/lib/fx'
import {NO_STORE} from '@/lib/api'

export const runtime='nodejs'
export const dynamic='force-dynamic'

/** Reference FX for plan prices. A failed rate source still returns 200 so checkout can show INR only. */
export async function GET(req:Request){
 const url=new URL(req.url)
 const pick=resolveDisplay({
  currency:url.searchParams.get('currency'),
  country:url.searchParams.get('country'),
  geo:req.headers.get('x-vercel-ip-country'),
 })
 let perInr:number|null=null
 let fx:'live'|'fallback'|'unavailable'='unavailable'
 try{
  const rates=await dailyRates()
  const n=rates.rates[pick.currency]
  if(n>0){perInr=n;fx=rates.fx}
 }catch{perInr=null;fx='unavailable'}
 return NextResponse.json({
  currency:pick.currency,
  via:pick.via,
  country:pick.country,
  approximate:perInr!=null,
  fx,
  perInr,
  asOf:new Date().toISOString().slice(0,10),
 },{headers:NO_STORE})
}
