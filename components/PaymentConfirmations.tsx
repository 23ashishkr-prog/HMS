'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call,dt,inr} from '@/lib/client'
const ST:Record<string,string>={created:'Created',authorized:'Authorized',captured:'Paid',failed:'Failed',refunded:'Refunded',recorded:'Recorded'}
const METHOD:Record<string,string>={cash:'Cash',upi:'UPI',card:'Card',netbanking:'Net banking',insurance:'Insurance',other:'Other',razorpay:'Online gateway'}
/** All bill payments plus gateway attempts that have not posted to a bill yet. */
export default function PaymentConfirmations(){
 const[q,setQ]=useState(''),[status,setStatus]=useState(''),[after,setAfter]=useState(''),[before,setBefore]=useState('')
 const[d,setD]=useState<any>(null),[err,setErr]=useState('')
 const load=(opts?:any)=>{
  const qs=new URLSearchParams()
  const Q=opts?.q??q,S=opts?.status??status,A=opts?.after??after,B=opts?.before??before
  if(Q.trim())qs.set('q',Q.trim());if(S)qs.set('status',S);if(A)qs.set('after',A);if(B)qs.set('before',B)
  call('/api/hospital/gateway/payments'+(qs.toString()?'?'+qs:'')).then(setD).catch((e:any)=>setErr(e.message))
 }
 useEffect(()=>{load()},[])
 if(err&&!d)return <p className="banner err">{err}</p>
 if(!d)return <p className="muted">Loading…</p>
 const st=d.stats||{}
 return <div>
  <p className="muted"><small>Cash, UPI, card, online payments and front-desk receipts. Open gateway attempts stay here until they post. {st.reconciled?'Invoice payments match invoice totals.':'Invoice payments do not match invoice totals yet.'}</small></p>
  <div className="platStats">
   <div className="platStat"><b>{inr(st.payments_total||0)}</b><small>Recorded</small></div>
   <div className="platStat"><b>{inr(st.online_total||0)}</b><small>Online</small></div>
   <div className="platStat"><b>{inr(st.manual_total||0)}</b><small>Cash / UPI / card</small></div>
   <div className="platStat"><b>{inr(st.invoice_paid||0)}</b><small>On invoices</small></div>
   <div className="platStat"><b>{st.attempts||0}</b><small>Open attempts</small></div>
   <div className="platStat"><b>{d.gateway?.active?'On':'Off'}</b><small>Gateway</small></div>
  </div>
  <form className="platFilters" onSubmit={e=>{e.preventDefault();load()}} style={{display:'flex',flexWrap:'wrap',gap:12,margin:'16px 0'}}>
   <label>Search<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Patient, invoice, reference"/></label>
   <label>Method<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option>{['cash','upi','card','netbanking','insurance','other','razorpay','created','failed'].map(s=><option key={s} value={s}>{METHOD[s]||ST[s]||s}</option>)}</select></label>
   <label>From<input type="date" value={after} onChange={e=>setAfter(e.target.value)}/></label>
   <label>To<input type="date" value={before} onChange={e=>setBefore(e.target.value)}/></label>
   <button className="primary" type="submit">Filter</button>
  </form>
  <div className="platTableWrap"><table className="dataTable">
   <thead><tr><th>Time</th><th>Patient</th><th>Invoice</th><th>Method</th><th>Amount</th><th>Reference</th><th>Payment id</th><th>Entered by</th><th></th></tr></thead>
   <tbody>
    {d.payments.length===0&&<tr><td colSpan={9}>No payments yet.</td></tr>}
    {d.payments.map((r:any)=><tr key={r.source+r.id}>
     <td>{dt(r.paid_at||r.created_at)}</td>
     <td><b>{r.patient_name||'—'}</b><br/><small>{r.uhid||''}</small></td>
     <td><code>{r.invoice_no||'—'}</code></td>
     <td>{METHOD[r.mode]||r.mode}</td>
     <td>{inr(r.amount_inr)}</td>
     <td>{r.reference||'—'}</td>
     <td><code style={{fontSize:11}}>{r.provider_payment_id||r.provider_order_id||'—'}</code></td>
     <td>{r.entered_by||'—'}</td>
     <td>{r.invoice_id?<Link className="chip" href={'/billing?invoice='+r.invoice_id}>Bill</Link>:null}{r.status&&r.status!=='recorded'?<span className={'pill pill-'+r.status}>{ST[r.status]||r.status}</span>:null}</td>
    </tr>)}
   </tbody>
  </table></div>
 </div>
}
