'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import ModuleShell from '@/components/ModuleShell'
import {call,dt,inr} from '@/lib/client'

const ST:Record<string,string>={created:'Created',authorized:'Authorized',captured:'Paid',failed:'Failed',refunded:'Refunded'}

export default function GatewayPaymentsConfirm(){
 const[q,setQ]=useState(''),[status,setStatus]=useState(''),[after,setAfter]=useState(''),[before,setBefore]=useState('')
 const[d,setD]=useState<any>(null),[err,setErr]=useState('')
 const load=(opts?:any)=>{
  const qs=new URLSearchParams()
  const Q=opts?.q??q,S=opts?.status??status,A=opts?.after??after,B=opts?.before??before
  if(Q.trim())qs.set('q',Q.trim());if(S)qs.set('status',S);if(A)qs.set('after',A);if(B)qs.set('before',B)
  call('/api/hospital/gateway/payments'+(qs.toString()?'?'+qs:'')).then(setD).catch((e:any)=>setErr(e.message))
 }
 useEffect(()=>{load()},[])
 if(err&&!d)return <ModuleShell title="Gateway payments" eyebrow="BILLING · CONFIRMATIONS"><p className="banner err">{err}</p><p className="muted">Admin and billing only.</p></ModuleShell>
 if(!d)return <ModuleShell title="Gateway payments" eyebrow="BILLING · CONFIRMATIONS"><p className="muted">Loading…</p></ModuleShell>
 const st=d.stats||{}
 return <ModuleShell title="Payment confirmations" eyebrow="SETTINGS · PAYMENTS" description="Patient invoice payments confirmed through this hospital's own payment gateway. Cash/UPI recorded manually stay on the invoice payment list.">
  <p><Link className="chip" href="/settings/payments">Gateway settings</Link> <Link className="chip" href="/billing">Billing desk</Link></p>
  <div className="platStats">
   <div className="platStat"><b>{st.total||0}</b><small>Attempts</small></div>
   <div className="platStat"><b>{st.created||0}</b><small>Created</small></div>
   <div className="platStat"><b>{st.paid||0}</b><small>Paid</small></div>
   <div className="platStat"><b>{st.failed||0}</b><small>Failed</small></div>
   <div className="platStat"><b>{inr(st.paid_inr||0)}</b><small>Paid total</small></div>
   <div className="platStat"><b>{d.gateway?.active?'On':'Off'}</b><small>Gateway</small></div>
  </div>
  <form className="platFilters" onSubmit={e=>{e.preventDefault();load()}} style={{display:'flex',flexWrap:'wrap',gap:12,margin:'16px 0'}}>
   <label>Search<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Patient / UHID / invoice"/></label>
   <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option>{['created','captured','failed','authorized','refunded'].map(s=><option key={s} value={s}>{ST[s]}</option>)}</select></label>
   <label>From<input type="date" value={after} onChange={e=>setAfter(e.target.value)}/></label>
   <label>To<input type="date" value={before} onChange={e=>setBefore(e.target.value)}/></label>
   <button className="primary" type="submit">Filter</button>
  </form>
  <div className="platTableWrap"><table className="dataTable">
   <thead><tr><th>Paid at</th><th>Patient</th><th>UHID</th><th>Invoice</th><th>Amount</th><th>Status</th><th>Order id</th><th>Payment id</th><th></th></tr></thead>
   <tbody>
    {d.payments.length===0&&<tr><td colSpan={9}>No gateway payments yet.</td></tr>}
    {d.payments.map((r:any)=><tr key={r.id}>
     <td>{dt(r.paid_at||r.created_at)}</td>
     <td><b>{r.patient_name||'—'}</b></td>
     <td><code>{r.uhid||'—'}</code></td>
     <td><code>{r.invoice_no||'—'}</code></td>
     <td>{inr(r.amount_inr)}</td>
     <td><span className={'pill pill-'+r.status}>{ST[r.status]||r.status}</span></td>
     <td><code style={{fontSize:11}}>{r.provider_order_id||'—'}</code></td>
     <td><code style={{fontSize:11}}>{r.provider_payment_id||'—'}</code></td>
     <td>{r.invoice_id?<Link className="chip" href={'/billing?invoice='+r.invoice_id}>Invoice</Link>:null}</td>
    </tr>)}
   </tbody>
  </table></div>
 </ModuleShell>
}
