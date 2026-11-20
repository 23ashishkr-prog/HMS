'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'
import {CurrencyTotals,PlatformEvents,PRODUCT_LABEL,TailDeskState,productPath,usePlatformProduct} from '@/components/PlatformProduct'

export default function PlatformOverview(){
 const {product,ready}=usePlatformProduct()
 const[d,setD]=useState<any>(null)
 const[leads,setLeads]=useState<any>(null)
 const[err,setErr]=useState('')
 useEffect(()=>{
  if(!ready)return
  setD(null);setErr('')
  call(productPath(product,'/api/platform/hospitals')).then(setD).catch((e:any)=>setErr(e.message))
  call('/api/platform/leads').then(setLeads).catch(()=>setLeads({leads:[],counts:{}}))
 },[ready,product])

 if(err&&!d)return <PlatformSignIn/>
 if(!d)return <PlatformShell title="Overview"><p>Loading…</p></PlatformShell>
 const s=d.stats||{}
 const rev=d.revenue||{}
 const tail=product!=='hms'
 const label=PRODUCT_LABEL[product]
 const plans=tail?(d.plan_counts||[]):[
  {code:'clinic',name:'Clinic (Basic)',count:s.plan_clinic||0},
  {code:'engage',name:'Customer Engagement',count:s.plan_engage||0},
  {code:'engage_support',name:'Engagement + support',count:s.plan_engage_support||0},
  {code:'basic',name:'Basic (kept)',count:s.plan_basic||0},
  {code:'ai',name:'AI+ (kept)',count:s.plan_ai||0},
 ]

 return (
  <PlatformShell
   title="Overview"
   eyebrow={tail?'SAAS OWNER · '+label.toUpperCase():'SAAS OWNER · DASHBOARD'}
   description={tail
    ?label+' tenants, plan subscriptions, trial and expiry, revenue and events. HMS data is unchanged.'
    :'Hospital tenants, plan subscriptions, and platform health. Use the tabs above for hospitals, payments, gateway, and incidents.'}
  >
   <TailDeskState d={d}/>
   <div className="platStats">
    <Link className="platStat platStatLink" href="/platform/hospitals"><b>{s.total||0}</b><small>{tail?(product==='smartshop'?'Total shops':'Total tenants'):'Total hospitals'}</small></Link>
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
    <Link className="platQuickCard" href="/platform/leads"><b>Leads</b><span>{leadOpen(leads)} open · {leads?.leads?.length||0} in the list</span></Link>
   </div>}

   <LeadBoard data={leads}/>

   <section className="panel modulePanel" style={{marginTop:24}}>
    <h2>Subscription events</h2>
    <PlatformEvents events={d.events||[]}/>
   </section>
  </PlatformShell>
 )
}

const PRODUCT:Record<string,string>={hospital_cloud:'Hospital cloud',taildesk:'TailDesk',other:'Other'}
function leadOpen(data:any){const c=data?.counts||{};return (c.new||0)+(c.contacted||0)+(c.demo||0)+(c.trial||0)}
function when(v:string){try{return new Date(v).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}catch{return ''}}

function LeadBoard({data}:{data:any}){
 const rows=data?.leads||[]
 const c=data?.counts||{}
 return (
  <section className="platLeadBoard" id="leads">
   <div className="sheetHead">
    <h2>Leads</h2>
    <Link href="/platform/leads" className="ghost">Open pipeline</Link>
   </div>
   <div className="platStats">
    <div className="platStat"><b>{data?rows.length:'—'}</b><small>All leads</small></div>
    <div className="platStat"><b>{data?(c.new||0):'—'}</b><small>New</small></div>
    <div className="platStat"><b>{data?leadOpen(data):'—'}</b><small>Still open</small></div>
    <div className="platStat"><b>{data?(c.won||0):'—'}</b><small>Won</small></div>
   </div>
   <div className="platTableWrap">
    <table className="platLeadTable">
     <thead><tr><th>When</th><th>Name</th><th>Organisation</th><th>Email</th><th>Product</th><th>Source</th><th>Status</th></tr></thead>
     <tbody>
      {rows.slice(0,20).map((l:any)=>(
       <tr key={l.id}>
        <td>{when(l.created_at)}</td>
        <td>{l.name}</td>
        <td>{l.hospital_name}</td>
        <td>{l.email||'—'}</td>
        <td>{PRODUCT[l.product]||'Hospital cloud'}</td>
        <td>{l.source||'—'}</td>
        <td><span className={'pill pill-'+l.status}>{l.status}</span></td>
       </tr>
      ))}
     </tbody>
    </table>
    {data&&!rows.length&&<p className="muted" style={{padding:'14px 16px'}}>No leads yet. New enquiries from the website appear here.</p>}
    {!data&&<p className="muted" style={{padding:'14px 16px'}}>Loading leads…</p>}
   </div>
  </section>
 )
}
