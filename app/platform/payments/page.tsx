'use client'
import {useEffect,useState,Suspense} from 'react'
import Link from 'next/link'
import {useSearchParams} from 'next/navigation'
import {call,dt} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

const PLAN:Record<string,string>={clinic:'Clinic',basic:'Basic',ai_engage:'AI + Engagement'}
const ST:Record<string,string>={created:'Created',authorized:'Authorized',captured:'Paid',failed:'Failed',refunded:'Refunded'}

function PaymentsInner(){
 const sp=useSearchParams()
 const[q,setQ]=useState(sp.get('q')||'')
 const[status,setStatus]=useState(sp.get('status')||'')
 const[after,setAfter]=useState(sp.get('after')||'')
 const[before,setBefore]=useState(sp.get('before')||'')
 const[hospitalId,setHospitalId]=useState(sp.get('hospitalId')||'')
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')

 const load=(opts?:any)=>{
  const qs=new URLSearchParams()
  const Q=opts?.q??q,S=opts?.status??status,A=opts?.after??after,B=opts?.before??before,H=opts?.hospitalId??hospitalId
  if(Q.trim())qs.set('q',Q.trim())
  if(S)qs.set('status',S)
  if(A)qs.set('after',A)
  if(B)qs.set('before',B)
  if(H)qs.set('hospitalId',H)
  call('/api/platform/payments'+(qs.toString()?'?'+qs:'')).then(setD).catch((e:any)=>setErr(e.message))
 }
 useEffect(()=>{load()},[])

 if(err&&!d)return <PlatformSignIn title="Payment check"/>
 if(!d)return <main className="plat"><p>Loading…</p></main>
 const st=d.stats||{}
 const rows=d.payments||[]

 return (
  <PlatformShell
   title="Payment check"
   eyebrow="SAAS OWNER · PAYMENTS"
   description={<>All hospital <b>plan</b> payment confirmations (Clinic / Basic / AI+). Not patient bills.</>}
  >
   <div className="platStats">
    <div className="platStat"><b>{st.total||0}</b><small>Total attempts</small></div>
    <div className="platStat"><b>{st.created||0}</b><small>Created</small></div>
    <div className="platStat"><b>{st.paid||0}</b><small>Paid</small></div>
    <div className="platStat"><b>{st.failed||0}</b><small>Failed</small></div>
    <div className="platStat"><b>₹{Number(st.paid_inr||0).toLocaleString('en-IN')}</b><small>Paid total</small></div>
    <div className="platStat"><b>{d.paymentsConfigured?'On':'Off'}</b><small>Gateway</small></div>
   </div>

   <form className="platFilters" onSubmit={e=>{e.preventDefault();load()}}>
    <label>Hospital search<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name or code"/></label>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option>{['created','authorized','captured','failed','refunded'].map(s=><option key={s} value={s}>{ST[s]||s}</option>)}</select></label>
    <label>From<input type="date" value={after} onChange={e=>setAfter(e.target.value)}/></label>
    <label>To<input type="date" value={before} onChange={e=>setBefore(e.target.value)}/></label>
    <div className="platFilterBtns">
     <button className="primary" type="submit">Filter</button>
     <button type="button" onClick={()=>{setQ('');setStatus('');setAfter('');setBefore('');setHospitalId('');load({q:'',status:'',after:'',before:'',hospitalId:''})}}>Reset</button>
    </div>
   </form>
   {hospitalId&&<p><small>Filtered to hospital id <code>{hospitalId}</code> · <button type="button" className="chip" onClick={()=>{setHospitalId('');load({hospitalId:''})}}>Clear</button></small></p>}

   <div className="platTableWrap platDesktopOnly">
    <table className="dataTable platPayTable">
     <thead><tr>
      <th>Paid at</th><th>Hospital</th><th>Plan</th><th>Amount</th><th>Status</th><th>Order / Payment</th><th>Sub window</th><th></th>
     </tr></thead>
     <tbody>
      {rows.length===0&&<tr><td colSpan={8}>No plan payments match.</td></tr>}
      {rows.map((r:any)=><tr key={r.id}>
       <td>{dt(r.paid_at||r.created_at)}</td>
       <td><b>{r.hospital_name}</b><div><code>{r.hospital_code}</code></div></td>
       <td>{PLAN[r.plan_code]||r.plan_code}<div><small>{r.billing_period}</small></div></td>
       <td>₹{Number(r.amount_inr).toLocaleString('en-IN')}</td>
       <td><span className={'pill pill-'+r.status}>{ST[r.status]||r.status}</span></td>
       <td className="platIds"><code>{r.provider_order_id||'—'}</code><code>{r.provider_payment_id||'—'}</code></td>
       <td>{r.status==='captured'||r.status==='authorized'?<>{dt(r.current_period_start)} → {dt(r.current_period_end)}</>:'—'}</td>
       <td><Link className="chip" href={'/platform/hospitals/'+r.hospital_id}>Open</Link></td>
      </tr>)}
     </tbody>
    </table>
   </div>

   <div className="platCardList platMobileOnly">
    {rows.length===0&&<p className="muted">No plan payments match.</p>}
    {rows.map((r:any)=>(
     <article key={r.id} className="platHospCard">
      <div className="platHospCardTop">
       <div>
        <b>{r.hospital_name}</b> · <code>{r.hospital_code}</code>
        <div>{PLAN[r.plan_code]||r.plan_code} · {r.billing_period} · <span className={'pill pill-'+r.status}>{ST[r.status]||r.status}</span></div>
       </div>
       <b>₹{Number(r.amount_inr).toLocaleString('en-IN')}</b>
      </div>
      <dl className="platHospMeta">
       <div><dt>Paid</dt><dd>{dt(r.paid_at||r.created_at)}</dd></div>
       <div><dt>Order</dt><dd><code>{r.provider_order_id||'—'}</code></dd></div>
       <div><dt>Payment</dt><dd><code>{r.provider_payment_id||'—'}</code></dd></div>
      </dl>
      <Link className="chip" href={'/platform/hospitals/'+r.hospital_id}>Hospital</Link>
     </article>
    ))}
   </div>
  </PlatformShell>
 )
}

export default function PaymentsPage(){
 return <Suspense fallback={<main className="plat"><p>Loading…</p></main>}><PaymentsInner/></Suspense>
}
