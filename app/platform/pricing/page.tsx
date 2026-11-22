'use client'
import {useEffect,useMemo,useState} from 'react'
import {call,dt} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'
import {PRODUCT_LABEL,usePlatformProduct} from '@/components/PlatformProduct'

type Offer={id:string;product:string;planCode:string|null;percent:number;label:string;startsOn:string;endsOn:string;active:boolean}
type Plan={code:string;name:string;monthlyInr:number;payInr:number;updatedAt:string|null;offer:null|{id:string;percent:number;label:string;endsOn:string;priceInr:number}}
type Data={catalog:{today:string;products:Record<string,{name:string;plans:Plan[]}>};offers:Offer[];log:any[]}

const inr=(n:number)=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN')
const off=(list:number,pct:number)=>Math.max(1,Math.round(list*(100-pct)/100))
const day=(s:string)=>new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
const ymd=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)
function monthRange(today:string,ahead:number){
 const t=new Date(today+'T00:00:00')
 const start=ahead===0?t:new Date(t.getFullYear(),t.getMonth()+ahead,1)
 const end=new Date(t.getFullYear(),t.getMonth()+ahead+1,0)
 return {startsOn:ymd(start),endsOn:ymd(end)}
}
/** Where each product's price is shown, for the "Where it appears" line. */
const SURFACES:Record<string,string>={
 hms:'HMS checkout and upgrade screen, sign-up page, greynova.in/hms and every country page',
 taildesk:'TailDesk checkout, greynova.in/taildesk and every country page',
 smartshop:'Smart Shop billing page, greynova.in Smart Shop pages in every country',
}

function PlanCard({plan,product,onSaved,setErr}:{plan:Plan;product:string;onSaved:(d:Data,msg:string)=>void;setErr:(s:string)=>void}){
 const[v,setV]=useState(String(plan.monthlyInr))
 const[busy,setBusy]=useState(false)
 useEffect(()=>{setV(String(plan.monthlyInr))},[plan.monthlyInr])
 const n=Math.round(Number(v))
 const dirty=Number.isFinite(n)&&n>=1&&n!==plan.monthlyInr
 const pct=plan.offer?.percent
 const save=async()=>{
  if(!dirty)return
  if(!window.confirm(`Change ${plan.name} from ${inr(plan.monthlyInr)} to ${inr(n)} a month?\n\nNew payments and every price page use it within about a minute. Payments already made are not changed.`))return
  setBusy(true);setErr('')
  try{onSaved(await call('/api/platform/pricing','PUT',{product,planCode:plan.code,monthlyInr:n}),`${plan.name} is now ${inr(n)} a month.`)}
  catch(e:any){setErr(e.message)}
  finally{setBusy(false)}
 }
 return <article className={'prCard'+(plan.offer?' prCardOffer':'')}>
  <div className="prCardHead">
   <div><b>{plan.name}</b><code>{plan.code}</code></div>
   {plan.offer&&<span className="prBadge">{plan.offer.label||`${pct}% off`}</span>}
  </div>
  <div className="prPrice">
   {plan.offer?<>
    <s>{inr(plan.monthlyInr)}</s>
    <strong>{inr(plan.offer.priceInr)}</strong><small>/month</small>
   </>:<><strong>{inr(plan.monthlyInr)}</strong><small>/month</small></>}
  </div>
  {plan.offer?<p className="prOfferLine">{pct}% off until {day(plan.offer.endsOn)}. Customers pay {inr(plan.offer.priceInr)}.</p>
   :<p className="prMuted">No offer running. Customers pay the list price.</p>}
  {product==='hms'&&<p className="prMuted">Annual (10 months): {inr(plan.payInr*10)}</p>}
  <form className="prEdit" onSubmit={e=>{e.preventDefault();save()}}>
   <label htmlFor={'p-'+plan.code}>Monthly list price (INR, ex-GST)</label>
   <div className="prEditRow">
    <span className="prRupee">₹</span>
    <input id={'p-'+plan.code} inputMode="numeric" value={v} onChange={e=>setV(e.target.value.replace(/[^\d]/g,''))} aria-describedby={'h-'+plan.code}/>
    <button className="prBtn primary" type="submit" disabled={!dirty||busy}>{busy?'Saving…':'Save'}</button>
   </div>
   <small id={'h-'+plan.code} className="prMuted">
    {dirty?<>{inr(plan.monthlyInr)} → <b>{inr(n)}</b> ({n>plan.monthlyInr?'+':''}{(((n-plan.monthlyInr)/plan.monthlyInr)*100).toFixed(1)}%){pct?<> · with the {pct}% offer: {inr(off(n,pct))}</>:null}</>
     :plan.updatedAt?<>Last changed {dt(plan.updatedAt)}</>:<>Starting price</>}
   </small>
  </form>
 </article>
}

export default function PricingPage(){
 const {product,ready}=usePlatformProduct()
 const[d,setD]=useState<Data|null>(null)
 const[err,setErr]=useState('')
 const[msg,setMsg]=useState('')
 const[denied,setDenied]=useState(false)
 const[busy,setBusy]=useState(false)
 // Offer form
 const[plan,setPlan]=useState('')
 const[pct,setPct]=useState('10')
 const[label,setLabel]=useState('')
 const[range,setRange]=useState<{startsOn:string;endsOn:string}>({startsOn:'',endsOn:''})

 useEffect(()=>{call('/api/platform/pricing').then((x:Data)=>{setD(x);setRange(monthRange(x.catalog.today,0))}).catch((e:any)=>{if(/sign-in|session|admin/i.test(e.message))setDenied(true);setErr(e.message)})},[])
 useEffect(()=>{setPlan('')},[product])

 const plans=d?.catalog.products[product]?.plans||[]
 const offers=useMemo(()=>(d?.offers||[]).filter(o=>o.product===product),[d,product])
 const today=d?.catalog.today||''
 const allLive=useMemo(()=>{
  if(!d)return 0
  return Object.values(d.catalog.products).reduce((a,p)=>a+p.plans.filter(x=>x.offer).length,0)
 },[d])

 if(denied)return <PlatformSignIn title="Subscription pricing"/>
 if(!d||!ready)return <PlatformShell title="Subscription pricing"><p>{err||'Loading…'}</p></PlatformShell>

 const saved=(x:Data,m:string)=>{setD(x);setMsg(m);setErr('')}
 const n=Number(pct)
 const pctOk=Number.isFinite(n)&&n>0&&n<=90
 const targets=plan?plans.filter(p=>p.code===plan):plans
 const startOffer=async(e:React.FormEvent)=>{
  e.preventDefault()
  if(!pctOk){setErr('Discount must be between 1% and 90%.');return}
  const who=plan?plans.find(p=>p.code===plan)?.name:`every ${PRODUCT_LABEL[product]} plan`
  if(!window.confirm(`Start ${n}% off ${who} from ${day(range.startsOn)} to ${day(range.endsOn)}?\n\nCheckout charges the offer price on those days, and price pages show the old price struck through.`))return
  setBusy(true);setErr('');setMsg('')
  try{
   saved(await call('/api/platform/pricing/offers','POST',{product,planCode:plan||null,percent:n,label,...range}),`${n}% offer saved for ${who}.`)
   setLabel('')
  }catch(ex:any){setErr(ex.message)}
  finally{setBusy(false)}
 }
 const endNow=async(o:Offer)=>{
  if(!window.confirm(`End the ${o.percent}% offer now? Customers go back to the list price within about a minute.`))return
  setBusy(true);setErr('');setMsg('')
  try{saved(await call('/api/platform/pricing/offers/'+o.id,'DELETE'),'Offer ended.')}
  catch(ex:any){setErr(ex.message)}
  finally{setBusy(false)}
 }
 const planName=(c:string|null)=>c?(plans.find(p=>p.code===c)?.name||c):'All plans'

 return <PlatformShell
  title="Subscription pricing"
  eyebrow={'SAAS OWNER · PRICING · '+PRODUCT_LABEL[product].toUpperCase()}
  description={<>Set each plan&apos;s monthly price in <b>INR</b> and run time-limited offers. Every country price is converted from this INR price at the weekly exchange rate. Changes reach checkout and greynova.in within about a minute.</>}
 >
  <div className="platStats">
   <div className="platStat"><b>{plans.length}</b><small>{PRODUCT_LABEL[product]} plans</small></div>
   <div className="platStat"><b>{plans.filter(p=>p.offer).length}</b><small>On offer today</small></div>
   <div className="platStat"><b>{offers.filter(o=>o.startsOn>today).length}</b><small>Scheduled offers</small></div>
   <div className="platStat"><b>{allLive}</b><small>Offers live, all products</small></div>
  </div>

  {msg&&<p className="ok" role="status">{msg}</p>}
  {err&&<p className="err" role="alert">{err}</p>}

  <section className="prSection">
   <div className="prSectionHead"><h2>Plans and prices</h2><small className="prMuted">Shown on: {SURFACES[product]}</small></div>
   <div className="prGrid">{plans.map(p=><PlanCard key={p.code} plan={p} product={product} onSaved={saved} setErr={setErr}/>)}</div>
  </section>

  <section className="prSection prSplit">
   <form className="prPanel" onSubmit={startOffer}>
    <h2>Run an offer</h2>
    <p className="prMuted">Customers see the list price struck through, the offer price and the end date.</p>
    <label>Plan
     <select value={plan} onChange={e=>setPlan(e.target.value)}>
      <option value="">All {PRODUCT_LABEL[product]} plans</option>
      {plans.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}
     </select>
    </label>
    <fieldset className="prFieldset">
     <legend>Discount</legend>
     <div className="prChips">{[5,10,15,20,25,30].map(x=><button key={x} type="button" className={'prChip chip'+(n===x?' prOn':'')} aria-pressed={n===x} onClick={()=>setPct(String(x))}>{x}%</button>)}</div>
     <div className="prEditRow"><input inputMode="decimal" value={pct} onChange={e=>setPct(e.target.value.replace(/[^\d.]/g,''))} aria-label="Discount percent"/><span className="prRupee">%</span></div>
    </fieldset>
    <label><span>Label shown to customers <span className="prMuted">(optional)</span></span>
     <input value={label} maxLength={60} onChange={e=>setLabel(e.target.value)} placeholder={pctOk?`${n}% off`:'e.g. Diwali offer'}/>
    </label>
    <fieldset className="prFieldset">
     <legend>When</legend>
     <div className="prChips">
      <button type="button" className="prChip chip" onClick={()=>setRange(monthRange(today,0))}>Rest of this month</button>
      <button type="button" className="prChip chip" onClick={()=>setRange(monthRange(today,1))}>Next month</button>
     </div>
     <div className="prDates">
      <label>Starts<input type="date" min={today} value={range.startsOn} onChange={e=>setRange({...range,startsOn:e.target.value})} required/></label>
      <label>Ends<input type="date" min={range.startsOn||today} value={range.endsOn} onChange={e=>setRange({...range,endsOn:e.target.value})} required/></label>
     </div>
     <small className="prMuted">Dates are India time, both days included.</small>
    </fieldset>
    <div className="prPreview" aria-live="polite">
     <b>Preview</b>
     {pctOk?targets.map(p=><div key={p.code} className="prPreviewRow"><span>{p.name}</span><span><s>{inr(p.monthlyInr)}</s> <strong>{inr(off(p.monthlyInr,n))}</strong></span></div>)
      :<small className="prMuted">Enter a discount between 1% and 90%.</small>}
    </div>
    <button className="prBtn primary" type="submit" disabled={busy||!pctOk||!range.startsOn||!range.endsOn}>{busy?'Saving…':'Start offer'}</button>
   </form>

   <div className="prPanel">
    <h2>Offers</h2>
    {offers.length===0?<p className="prMuted">No running or upcoming offers for {PRODUCT_LABEL[product]}.</p>:
     <ul className="prOffers">{offers.map(o=>{
      const live=o.startsOn<=today&&today<=o.endsOn
      return <li key={o.id}>
       <div>
        <span className={'prStatus '+(live?'live':'soon')}>{live?'Live':'Scheduled'}</span>
        <span><b>{o.percent}% off</b> · {planName(o.planCode)}</span>
        {o.label&&<div className="prMuted">“{o.label}”</div>}
        <small className="prMuted">{day(o.startsOn)} → {day(o.endsOn)}</small>
       </div>
       <button type="button" className="prGhost chip" disabled={busy} onClick={()=>endNow(o)}>{live?'End now':'Cancel'}</button>
      </li>
     })}</ul>}
    <p className="prMuted"><small>If two offers overlap, the bigger discount applies.</small></p>

    <h2 className="prLogHead">Recent changes</h2>
    {(d.log||[]).length===0?<p className="prMuted">No changes yet.</p>:
     <ul className="prLog">{d.log.slice(0,12).map((l:any,i:number)=><li key={i}>
      <span>{PRODUCT_LABEL[l.product as keyof typeof PRODUCT_LABEL]||l.product}{l.plan_code?` · ${l.plan_code}`:''}</span>
      <span>{l.action==='price'?<>{inr(l.details?.from)} → {inr(l.details?.to)}</>:l.action==='offer_start'?<>{l.details?.percent}% offer, {day(l.details?.startsOn)} → {day(l.details?.endsOn)}</>:<>Offer ended</>}</span>
      <small className="prMuted">{dt(l.at)} · {l.by_email||'—'}</small>
     </li>)}</ul>}
   </div>
  </section>
 </PlatformShell>
}
