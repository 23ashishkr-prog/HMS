'use client'
import {useEffect,useState,ComponentProps} from 'react'
import Link from 'next/link'
import {withBase} from '@/lib/basePath'
import {convertInr,FALLBACK_PER_INR,fxParamFromSearch,hrefWithFx,DisplayCurrency,FxCurrency} from '@/lib/fx'

const KEY='hms.fx'
type Quote={currency:DisplayCurrency;perInr:number|null;fx:'live'|'fallback'|'unavailable'|'inr';via:string}

let quote:Quote|null=null
let quoteKey=''
let pending:Promise<Quote>|null=null
const listeners=new Set<(q:Quote)=>void>()

function remember(search:string){
 const param=fxParamFromSearch(search)
 if(param)sessionStorage.setItem(KEY,param)
}

function load(search:string){
 remember(search)
 const key=sessionStorage.getItem(KEY)||''
 if(quote&&quoteKey===key)return Promise.resolve(quote)
 if(!pending||quoteKey!==key){
  quoteKey=key
  const qs=key?('?'+key):''
  pending=fetch(withBase('/api/pricing'+qs),{cache:'no-store'})
   .then(r=>r.json())
   .then(j=>{
    const cur:DisplayCurrency=j.currency==='INR'||j.currency==='GBP'||j.currency==='EUR'||j.currency==='USD'?j.currency:'USD'
    const next:Quote={currency:cur,perInr:typeof j.perInr==='number'?j.perInr:null,fx:j.fx==='live'||j.fx==='fallback'||j.fx==='inr'?j.fx:'unavailable',via:String(j.via||'')}
    quote=next
    listeners.forEach(fn=>fn(next))
    return next
   })
   .catch(()=>{
    const next:Quote={currency:'USD',perInr:null,fx:'unavailable',via:'default'}
    quote=next
    listeners.forEach(fn=>fn(next))
    return next
   })
 }
 return pending
}

export function useFx(){
 const[q,setQ]=useState<Quote|null>(quote)
 useEffect(()=>{
  const on=(v:Quote)=>setQ(v)
  listeners.add(on)
  load(location.search).then(setQ)
  return ()=>{listeners.delete(on)}
 },[])
 return {quote:q}
}

function localAmount(inr:number,q:Quote|null){
 if(!q||q.currency==='INR')return null
 const rate=q.perInr??FALLBACK_PER_INR[q.currency as FxCurrency]
 return convertInr(inr,rate)
}
function money(n:number,currency:string){
 return new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:n>=100?0:2}).format(n)
}
function rupee(n:number){return '₹'+Number(n).toLocaleString('en-IN')}

/** India shows rupees only. Everywhere else shows the local currency only. */
export function PlanPrice({inr,per,prefix,wasInr}:{inr:number;per?:string;prefix?:string;wasInr?:number|null}){
 const {quote}=useFx()
 const unit=per?`/${per}`:''
 const lead=prefix||''
 if(!quote)return <b className="priceWait" data-fx="0">…</b>
 const was=wasInr&&wasInr>inr?wasInr:null
 if(quote.currency==='INR')return <b data-fx="INR">{was!=null&&<s className="priceWas">{rupee(was)}</s>}{lead}{rupee(inr)}<small>{unit}</small></b>
 const n=localAmount(inr,quote)
 if(n==null)return <b data-fx="0">…</b>
 const w=was!=null?localAmount(was,quote):null
 return <b data-fx={quote.currency}>{w!=null&&<s className="priceWas">{money(w,quote.currency)}</s>}{lead}{money(n,quote.currency)}<small>{unit}</small></b>
}

/** Shown only on the pay button, and only when the screen is not in rupees. Razorpay orders are created in INR. */
export function InrChargeNote({inr}:{inr:number}){
 const {quote}=useFx()
 if(!quote||quote.currency==='INR')return null
 return <small className="fxCharge">Your card is charged the equivalent in INR ({rupee(inr)}).</small>
}

/** Keeps ?currency= or ?country= on links such as /onboarding?plan=basic. */
export function FxLink({href,...rest}:ComponentProps<typeof Link>){
 const[to,setTo]=useState(href)
 useEffect(()=>{
  remember(location.search)
  setTo(hrefWithFx(String(href),sessionStorage.getItem(KEY)))
 },[href])
 return <Link href={to} onMouseDown={()=>{remember(location.search);setTo(hrefWithFx(String(href),sessionStorage.getItem(KEY)))}} {...rest}/>
}

/** Today's HMS prices and offers from the platform console's public feed, fetched once per page. */
type BookRow={monthlyInr:number;payInr:number;offer:null|{percent:number;label:string;endsOn:string}}
let bookPending:Promise<Record<string,BookRow>>|null=null
function loadBook(){
 if(!bookPending)bookPending=fetch(withBase('/api/public/pricing')).then(r=>r.ok?r.json():null).then((x:any)=>{
  const m:Record<string,BookRow>={}
  for(const p of x?.products?.hms?.plans||[])if(Number(p.monthlyInr)>0)m[p.code]={monthlyInr:Number(p.monthlyInr),payInr:Number(p.payInr)||Number(p.monthlyInr),offer:p.offer||null}
  return m
 }).catch(()=>({}))
 return bookPending
}
export function usePriceBook(){
 const[book,setBook]=useState<Record<string,BookRow>|null>(null)
 useEffect(()=>{let live=true;loadBook().then(b=>{if(live)setBook(b)});return()=>{live=false}},[])
 return book
}
const endsOn=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'})

/** A plan's price as checkout charges it today: the console price, with the list price struck through and
 *  the offer's end date while an offer runs. Annual is 10 months, the same as checkout. `inr` is the fallback. */
export function LivePlanPrice({code,inr,per='month',prefix,annual,showOffer=true}:{code:string;inr:number;per?:string;prefix?:string;annual?:boolean;showOffer?:boolean}){
 const book=usePriceBook()
 const b=book?.[code]
 const k=annual?10:1
 const list=b?b.monthlyInr*k:inr
 const pay=b?b.payInr*k:inr
 const offer=b?.offer&&pay<list?b.offer:null
 return <>
  <PlanPrice inr={pay} wasInr={offer?list:null} per={per} prefix={prefix}/>
  {offer&&showOffer&&<small className="offerEnds">{offer.label||`${offer.percent}% off`} · ends {endsOn(offer.endsOn)}</small>}
 </>
}
