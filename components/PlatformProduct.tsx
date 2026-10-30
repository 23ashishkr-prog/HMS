'use client'
import {createContext,useContext,useEffect,useState,ReactNode} from 'react'
import {dt} from '@/lib/client'
import {formatMoney,moneyPair} from '@/lib/money'

export type PlatformProduct='hms'|'taildesk'
const KEY='hms.platform.product'

type Ctx={product:PlatformProduct;ready:boolean;setProduct:(p:PlatformProduct)=>void}
const C=createContext<Ctx>({product:'hms',ready:false,setProduct:()=>{}})

function stored():PlatformProduct{
 if(typeof window==='undefined')return 'hms'
 const q=new URLSearchParams(window.location.search).get('product')
 if(q==='taildesk'||q==='hms')return q
 return localStorage.getItem(KEY)==='taildesk'?'taildesk':'hms'
}

export function PlatformProductProvider({children}:{children:ReactNode}){
 const[product,setProductState]=useState<PlatformProduct>('hms')
 const[ready,setReady]=useState(false)
 useEffect(()=>{
  const p=stored()
  setProductState(p)
  localStorage.setItem(KEY,p)
  setReady(true)
 },[])
 const setProduct=(p:PlatformProduct)=>{
  setProductState(p)
  localStorage.setItem(KEY,p)
  const u=new URL(window.location.href)
  if(p==='taildesk')u.searchParams.set('product','taildesk')
  else u.searchParams.delete('product')
  history.replaceState(null,'',u.pathname+u.search+u.hash)
 }
 return <C.Provider value={{product,ready,setProduct}}>{children}</C.Provider>
}

export function usePlatformProduct(){return useContext(C)}

export function ProductSwitch(){
 const {product,setProduct}=usePlatformProduct()
 return <div className="platProduct" role="group" aria-label="Product">
  <button type="button" className={product==='hms'?'on':''} aria-pressed={product==='hms'} onClick={()=>setProduct('hms')}>HMS</button>
  <button type="button" className={product==='taildesk'?'on':''} aria-pressed={product==='taildesk'} onClick={()=>setProduct('taildesk')}>TailDesk</button>
 </div>
}

export function productPath(product:PlatformProduct,path:string,params?:Record<string,string>){
 const qs=new URLSearchParams()
 if(product==='taildesk')qs.set('product','taildesk')
 if(params)for(const[k,v]of Object.entries(params))if(v)qs.set(k,v)
 const s=qs.toString()
 return path+(s?'?'+s:'')
}

export function tenantHref(product:PlatformProduct,id:string){
 return product==='taildesk'?`/platform/hospitals/${id}?product=taildesk`:`/platform/hospitals/${id}`
}

export function MoneyCell({row}:{row:any}){
 const {currency,original,inr}=moneyPair(row||{})
 if(original==null&&inr==null)return <>—</>
 if(currency==='INR')return <>₹{Number(original??inr).toLocaleString('en-IN')}</>
 return <span className="platMoney"><span>{formatMoney(original,currency)}</span>{inr==null?<small>INR equivalent unavailable</small>:<small>≈ ₹{Number(inr).toLocaleString('en-IN')}</small>}</span>
}

export function TailDeskState({d}:{d:any}){
 const {product}=usePlatformProduct()
 if(product!=='taildesk')return null
 if(d?.configured===false)return <div className="platNote" role="status"><b>TailDesk is not configured.</b><div>{d.message||'Set TAILDESK_API_URL and TAILDESK_PLATFORM_API_KEY. HMS keeps using its own database.'}</div></div>
 if(d?.upstreamError)return <div className="platNote" role="alert"><b>TailDesk data is unavailable.</b><div>{d.upstreamError}</div></div>
 return <p className="muted"><small>Read-only. Tenants, subscriptions and revenue come from TailDesk’s own database through its platform API.</small></p>
}

export function HmsOnlyNote(){
 const {product}=usePlatformProduct()
 if(product!=='taildesk')return null
 return <div className="platNote"><b>This page is HMS.</b> Gateway settings, incidents and leads stay in the HMS database. Use the HMS | TailDesk switch for TailDesk tenants, subscriptions, revenue and events.</div>
}

export function PlatformEvents({events}:{events:any[]}){
 if(!events?.length)return <p className="muted">No subscription events yet.</p>
 return <div className="platTableWrap"><table className="dataTable"><thead><tr><th>When</th><th>Tenant</th><th>Event</th><th>Provider</th><th>Amount</th></tr></thead>
  <tbody>{events.map((e:any)=><tr key={String(e.id)}>
   <td>{dt(e.received_at)}</td>
   <td><b>{e.hospital_name||'—'}</b>{e.hospital_code&&<div><code>{e.hospital_code}</code></div>}</td>
   <td><code>{e.event_type}</code></td>
   <td>{e.provider||'—'}</td>
   <td><MoneyCell row={e}/></td>
  </tr>)}</tbody></table></div>
}

export function CurrencyTotals({stats}:{stats:any}){
 const rows=(stats?.by_currency||[]).filter((c:any)=>String(c.currency||'INR').toUpperCase()!=='INR'||Number(c.missing_inr||0)>0)
 if(!rows.length&&!stats?.missing_inr)return null
 return <div className="platStats">
  {(stats.by_currency||[]).map((c:any)=><div key={c.currency} className="platStat"><b>{formatMoney(c.amount,c.currency)}</b><small>{String(c.currency).toUpperCase()}{String(c.currency).toUpperCase()!=='INR'&&<> · ≈ ₹{Number(c.amount_in_inr||0).toLocaleString('en-IN')}</>}</small></div>)}
  {stats.missing_inr>0&&<div className="platStat"><b>{stats.missing_inr}</b><small>Payments without an INR equivalent</small></div>}
 </div>
}
