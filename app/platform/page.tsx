'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'
import {CurrencyTotals,PlatformEvents,TailDeskState,productPath,usePlatformProduct} from '@/components/PlatformProduct'

export default function PlatformOverview(){
 const {product,ready}=usePlatformProduct()
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 useEffect(()=>{
  if(!ready)return
  setD(null);setErr('')
  call(productPath(product,'/api/platform/hospitals')).then(setD).catch((e:any)=>setErr(e.message))
 },[ready,product])

 if(err&&!d)return <PlatformSignIn/>
 if(!d)return <PlatformShell title="Overview"><p>Loading…</p></PlatformShell>
 const s=d.stats||{}
 const rev=d.revenue||{}
 const tail=product==='taildesk'
 const plans=tail?(d.plan_counts||[]):[
  {code:'clinic',name:'Clinic',count:s.plan_clinic||0},
  {code:'basic',name:'Basic',count:s.plan_basic||0},
  {code:'ai',name:'AI + Engagement',count:s.plan_ai||0},
 ]

 return (
  <PlatformShell
   title="Overview"
   eyebrow={tail?'SAAS OWNER · TAILDESK':'SAAS OWNER · DASHBOARD'}
   description={tail
    ?'TailDesk tenants, plan subscriptions, trial and expiry, revenue and events. HMS data is unchanged.'
    :'Hospital tenants, plan subscriptions, and platform health. Use the tabs above for hospitals, payments, gateway, and incidents.'}
  >
   <TailDeskState d={d}/>
   <div className="platStats">
    <Link className="platStat platStatLink" href="/platform/hospitals"><b>{s.total||0}</b><small>{tail?'Total tenants':'Total hospitals'}</small></Link>
    <div className="platStat"><b>{s.trial||0}</b><small>Trial</small></div>
    <div className="platStat"><b>{s.active||0}</b><small>Active (paid)</small></div>
    <div className="platStat"><b>{s.held||0}</b><small>On hold</small></div>
    <div className="platStat"><b>{s.expired||0}</b><small>Expired / cancelled</small></div>
    <div className="platStat"><b>{s.past_due||0}</b><small>Past due</small></div>
    {plans.map((p:any)=><div key={p.code} className="platStat"><b>{p.count||0}</b><small>{p.name}</small></div>)}
    <Link className="platStat platStatLink" href="/platform/payments"><b>₹{Number(rev.paid_inr||0).toLocaleString('en-IN')}</b><small>Revenue (INR equivalent)</small></Link>
    {!tail&&<Link className="platStat platStatLink" href="/platform/payments"><b>{s.paid_via_razorpay||0}</b><small>Paid via Razorpay</small></Link>}
   </div>
   <CurrencyTotals stats={rev}/>

   {!tail&&<div className="platQuick">
    <Link className="platQuickCard" href="/platform/hospitals"><b>Hospitals</b><span>List, filter, open detail for ledger &amp; lifecycle</span></Link>
    <Link className="platQuickCard" href="/platform/payments"><b>Payments</b><span>Plan payment confirmations across tenants</span></Link>
    <Link className="platQuickCard" href="/platform/settings"><b>Gateway</b><span>Platform Razorpay keys for subscriptions</span></Link>
    <Link className="platQuickCard" href="/platform/incidents"><b>Incidents</b><span>Server errors and alert status</span></Link>
    <Link className="platQuickCard" href="/platform/leads"><b>Leads</b><span>Inbound interest / waitlist</span></Link>
   </div>}

   <section className="panel modulePanel" style={{marginTop:24}}>
    <h2>Subscription events</h2>
    <PlatformEvents events={d.events||[]}/>
   </section>
  </PlatformShell>
 )
}
