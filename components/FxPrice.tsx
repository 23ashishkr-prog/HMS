'use client'
import {useEffect,useState,ComponentProps} from 'react'
import Link from 'next/link'
import {withBase} from '@/lib/basePath'
import {convertInr,fxParamFromSearch,hrefWithFx,DisplayCurrency} from '@/lib/fx'

const KEY='hms.fx'
type Quote={currency:DisplayCurrency;perInr:number|null;fx:'live'|'fallback'|'unavailable';via:string}

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
    const next:Quote={currency:j.currency==='GBP'||j.currency==='EUR'?j.currency:'USD',perInr:typeof j.perInr==='number'?j.perInr:null,fx:j.fx==='live'||j.fx==='fallback'?j.fx:'unavailable',via:String(j.via||'')}
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
 const approx=(inr:number)=>{
  const n=convertInr(inr,q?.perInr??null)
  if(n==null||!q)return null
  return new Intl.NumberFormat('en-GB',{style:'currency',currency:q.currency,maximumFractionDigits:n>=100?0:2}).format(n)
 }
 return {quote:q,approx}
}

/** Reference amount next to the rupee price. Renders nothing when rates are unavailable. */
export function Approx({inr,per,mode='list'}:{inr:number;per?:string;mode?:'list'|'pay'|'paid'}){
 const {approx}=useFx()
 const a=approx(inr)
 if(!a)return null
 const rupee='₹'+Number(inr).toLocaleString('en-IN')
 const unit=per?` / ${per}`:''
 const text=mode==='paid'
  ?`Razorpay charged ${rupee}. About ${a} · approximate, for reference only.`
  :mode==='pay'
   ?`About ${a}${unit} · approximate. Razorpay will charge ${rupee}.`
   :`About ${a}${unit} · approximate. Billed in INR (${rupee}).`
 return <small className="fxApprox" data-fx="1">{text}</small>
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
