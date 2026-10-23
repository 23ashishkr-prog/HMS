'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {useParams} from 'next/navigation'
import {call,dt,formObj} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

const PLAN:Record<string,string>={clinic:'Clinic',basic:'Basic',ai_engage:'AI + Engagement'}

export default function HospitalDetail(){
 const {id}=useParams<{id:string}>()
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 const[msg,setMsg]=useState('')
 const load=()=>call('/api/platform/hospitals/'+id).then(setD).catch((e:any)=>setErr(e.message))
 useEffect(()=>{if(id)load()},[id])

 if(err&&!d)return <PlatformSignIn title="Hospital" hint="Sign in as platform owner, then open this hospital again."/>
 if(!d)return <main className="plat"><p>Loading…</p></main>
 const h=d.hospital

 const act=async(b:any)=>{try{await call('/api/platform/hospitals/'+id+'/lifecycle','POST',b);load()}catch(e:any){setMsg(e.message)}}

 return (
  <PlatformShell
   title={h.name}
   eyebrow="SAAS OWNER · HOSPITAL"
   description={<>Live tenant · code <code>{h.code}</code>{h.status!=='active'&&<> · <span className="err">tenant deactivated</span></>}</>}
   actions={<Link className="chip" href="/platform/hospitals">← All hospitals</Link>}
  >
   {msg&&<p className="err">{msg}</p>}

   <div className="platStats">
    <div className="platStat"><b>{PLAN[h.plan_code]||h.plan_code||'—'}</b><small>Plan</small></div>
    <div className="platStat"><b>{h.sub_status||'—'}</b><small>Subscription</small></div>
    <div className="platStat"><b>{dt(h.current_period_start)||dt(h.created_at)}</b><small>Start</small></div>
    <div className="platStat"><b>{dt(h.current_period_end)||dt(h.trial_ends_at)}</b><small>Expiry / trial end</small></div>
    <div className="platStat"><b>{h.users}</b><small>Users</small></div>
    <div className="platStat"><b>{h.patients}</b><small>Patients</small></div>
    <div className="platStat"><b>{h.billing_period||'—'}</b><small>Billing period</small></div>
    <div className="platStat"><b>{h.provider||'—'}</b><small>Provider</small></div>
   </div>

   <section className="panel modulePanel">
    <h2>Admin contact</h2>
    <p><b>{h.admin_name||'—'}</b><br/><small>{h.admin_email||h.contact_email||'—'}</small><br/><small>{h.admin_phone||h.contact_phone||'—'}</small></p>
    <p className="muted"><small>Address: {h.address||'—'} · GSTIN: {h.gstin||'—'}</small></p>
    <div className="chips">
     <button className="chip" type="button" onClick={()=>act({action:'extend',what:'trial',days:30})}>+30d trial</button>
     <button className="chip" type="button" onClick={()=>act({action:'extend',what:'hold',days:30})}>+30d hold</button>
     <button className="chip" type="button" onClick={()=>{if(window.confirm('Change tenant status?'))act({action:'status',status:h.status==='active'?'deactivated':'active'})}}>{h.status==='active'?'Deactivate':'Reactivate'}</button>
     <Link className="chip" href={'/platform/payments?hospitalId='+h.id}>All payments</Link>
    </div>
    <form className="platForm" style={{marginTop:16,maxWidth:'100%',boxShadow:'none',padding:0}} onSubmit={async e=>{e.preventDefault();try{await call('/api/platform/hospitals/'+id,'PATCH',formObj(e));load();setMsg('')}catch(er:any){setMsg(er.message)}}}>
     <div className="platFilters" style={{marginBottom:0}}>
      <label>Plan<select name="planCode" defaultValue={h.plan_code||'basic'}><option value="clinic">clinic</option><option value="basic">basic</option><option value="ai_engage">ai_engage</option></select></label>
      <label>Status<select name="status" defaultValue={h.sub_status||'trialing'}>{['trialing','active','on_hold','past_due','cancelled','expired'].map(s=><option key={s}>{s}</option>)}</select></label>
      <div className="platFilterBtns"><button type="submit" className="primary">Save plan / status</button></div>
     </div>
    </form>
   </section>

   <section className="panel modulePanel" style={{marginTop:24}}>
    <div className="platHead" style={{marginBottom:12}}>
     <h2 style={{margin:0}}>Recent plan payments</h2>
     <Link href={'/platform/payments?hospitalId='+h.id}>Open payment check →</Link>
    </div>
    <div className="platTableWrap platDesktopOnly">
     <table className="dataTable"><thead><tr><th>Date</th><th>Plan</th><th>Period</th><th>Amount</th><th>Status</th><th>Payment id</th><th>Order</th></tr></thead>
      <tbody>{(d.payments||[]).length===0&&<tr><td colSpan={7}>No plan payments yet.</td></tr>}
       {(d.payments||[]).map((r:any)=><tr key={r.id}><td>{dt(r.paid_at||r.created_at)}</td><td>{PLAN[r.plan_code]||r.plan_code}</td><td>{r.billing_period}</td><td>₹{Number(r.amount_inr).toLocaleString('en-IN')}</td><td>{r.status}</td><td><code>{r.provider_payment_id||'—'}</code></td><td><code>{r.provider_order_id||'—'}</code></td></tr>)}
      </tbody></table>
    </div>
    <div className="platCardList platMobileOnly">
     {(d.payments||[]).length===0&&<p className="muted">No plan payments yet.</p>}
     {(d.payments||[]).map((r:any)=>(
      <article key={r.id} className="platHospCard">
       <div className="platHospCardTop">
        <div>{PLAN[r.plan_code]||r.plan_code} · {r.billing_period} · {r.status}</div>
        <b>₹{Number(r.amount_inr).toLocaleString('en-IN')}</b>
       </div>
       <small className="muted">{dt(r.paid_at||r.created_at)} · <code>{r.provider_payment_id||'—'}</code></small>
      </article>
     ))}
    </div>
   </section>
  </PlatformShell>
 )
}
