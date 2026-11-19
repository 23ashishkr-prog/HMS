/** Reference prices for visitors. Razorpay always charges the INR list price. */
export const DISPLAY_CURRENCIES=['USD','GBP','EUR'] as const
export type DisplayCurrency=typeof DISPLAY_CURRENCIES[number]
export type FxVia='currency'|'country'|'geo'|'default'

/** Europe and the EEA, shown in EUR. The UK is GBP and is not in this set. */
const EUROPE=new Set(['AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','SE','SI','SK','SM','UA','VA','XK'])

/** Foreign units for one rupee, used only when the daily rate source is down. */
export const FALLBACK_PER_INR:Record<DisplayCurrency,number>={USD:1/84,GBP:1/123,EUR:1/103}

export function isDisplayCurrency(v:unknown):v is DisplayCurrency{
 const x=String(v??'').trim().toUpperCase()
 return x==='USD'||x==='GBP'||x==='EUR'
}

export function currencyForCountry(country:string|null|undefined):DisplayCurrency{
 const c=String(country??'').trim().toUpperCase()
 if(c==='GB'||c==='UK')return 'GBP'
 if(EUROPE.has(c))return 'EUR'
 return 'USD'
}

/** Query currency wins, then a country code, then the edge geo header, then USD. */
export function resolveDisplay(opts:{currency?:string|null;country?:string|null;geo?:string|null}):{currency:DisplayCurrency;via:FxVia;country:string|null}{
 const cur=String(opts.currency??'').trim().toUpperCase()
 if(cur==='USD'||cur==='GBP'||cur==='EUR')return {currency:cur,via:'currency',country:null}
 const country=String(opts.country??'').trim().toUpperCase()
 if(/^[A-Z]{2}$/.test(country))return {currency:currencyForCountry(country),via:'country',country}
 const geo=String(opts.geo??'').trim().toUpperCase()
 if(/^[A-Z]{2}$/.test(geo))return {currency:currencyForCountry(geo),via:'geo',country:geo}
 return {currency:'USD',via:'default',country:null}
}

export function convertInr(inr:number,perInr:number|null){
 if(perInr==null||!(perInr>0)||!Number.isFinite(inr))return null
 const n=inr*perInr
 return Number.isFinite(n)?n:null
}

/** `currency=GBP` or `country=DE` to keep on later links in this tab. */
export function fxParamFromSearch(search:string):string|null{
 const q=new URLSearchParams(search.startsWith('?')?search.slice(1):search)
 const currency=(q.get('currency')||'').toUpperCase()
 if(currency==='USD'||currency==='GBP'||currency==='EUR')return 'currency='+currency
 const country=(q.get('country')||'').toUpperCase()
 if(/^[A-Z]{2}$/.test(country))return 'country='+country
 return null
}

export function hrefWithFx(path:string,stored:string|null){
 if(!stored)return path
 const hashAt=path.indexOf('#')
 const hash=hashAt>=0?path.slice(hashAt):''
 const base=hashAt>=0?path.slice(0,hashAt):path
 if(/[?&](currency|country)=/i.test(base))return path
 return base+(base.includes('?')?'&':'?')+stored+hash
}

type Cache={day:string;fx:'live'|'fallback';rates:Record<DisplayCurrency,number>}
let live:Cache|null=null
let failedAt=0

export async function dailyRates():Promise<Cache>{
 const day=new Date().toISOString().slice(0,10)
 if(live&&live.day===day)return live
 if(failedAt&&Date.now()-failedAt<5*60*1000)return {day,fx:'fallback',rates:FALLBACK_PER_INR}
 try{
  const ac=new AbortController()
  const timer=setTimeout(()=>ac.abort(),2500)
  const res=await fetch('https://open.er-api.com/v6/latest/INR',{signal:ac.signal,cache:'no-store'})
  clearTimeout(timer)
  const body=await res.json()
  const rates={USD:Number(body?.rates?.USD),GBP:Number(body?.rates?.GBP),EUR:Number(body?.rates?.EUR)}
  if(!res.ok||Object.values(rates).some(n=>!(n>0)||n>=1))throw new Error('fx')
  live={day,fx:'live',rates}
  failedAt=0
  return live
 }catch{
  failedAt=Date.now()
  return {day,fx:'fallback',rates:FALLBACK_PER_INR}
 }
}
