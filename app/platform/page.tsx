'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

export default function PlatformOverview(){
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 useEffect(()=>{call('/api/platform/hospitals').then(setD).catch((e:any)=>setErr(e.message))},[])

 if(err&&!d)return <PlatformSignIn/>
 if(!d)return <main className="plat"><p>Loading…</p></main>
 const s=d.stats||{}

 return (
  <PlatformShell
   title="Overview"
   eyebrow="SAAS OWNER · DASHBOARD"
   description="Hospital tenants, plan subscriptions, and platform health. Use the tabs above for hospitals, payments, gateway, and incidents."
  >
   <div className="platStats">
    <Link className="platStat platStatLink" href="/platform/hospitals"><b>{s.total||0}</b><small>Total hospitals</small></Link>
    <div className="platStat"><b>{s.trial||0}</b><small>Trial</small></div>
    <div className="platStat"><b>{s.active||0}</b><small>Active (paid)</small></div>
    <div className="platStat"><b>{s.held||0}</b><small>On hold</small></div>
    <div className="platStat"><b>{s.expired||0}</b><small>Expired / cancelled</small></div>
    <div className="platStat"><b>{s.past_due||0}</b><small>Past due</small></div>
    <div className="platStat"><b>{s.plan_clinic||0}</b><small>Clinic</small></div>
    <div className="platStat"><b>{s.plan_basic||0}</b><small>Basic</small></div>
    <div className="platStat"><b>{s.plan_ai||0}</b><small>AI + Engagement</small></div>
    <Link className="platStat platStatLink" href="/platform/payments"><b>{s.paid_via_razorpay||0}</b><small>Paid via Razorpay</small></Link>
   </div>

   <div className="platQuick">
    <Link className="platQuickCard" href="/platform/hospitals"><b>Hospitals</b><span>List, filter, open detail for ledger &amp; lifecycle</span></Link>
    <Link className="platQuickCard" href="/platform/payments"><b>Payments</b><span>Plan payment confirmations across tenants</span></Link>
    <Link className="platQuickCard" href="/platform/settings"><b>Gateway</b><span>Platform Razorpay keys for subscriptions</span></Link>
    <Link className="platQuickCard" href="/platform/incidents"><b>Incidents</b><span>Server errors and alert status</span></Link>
    <Link className="platQuickCard" href="/platform/leads"><b>Leads</b><span>Inbound interest / waitlist</span></Link>
   </div>
  </PlatformShell>
 )
}
