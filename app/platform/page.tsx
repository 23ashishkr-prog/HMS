'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call,formObj,dt} from '@/lib/client'

const PLAN_LABEL:Record<string,string>={clinic:'Clinic',basic:'Basic',ai_engage:'AI + Engagement'}
function d(x:any){return x?dt(x):'—'}

export default function Page(){
 const[rows,setRows]=useState<any[]|null>(null)
 const[stats,setStats]=useState<any>(null)
 const[msg,setMsg]=useState('')
 const[inc,setInc]=useState<any>(null)
 const[q,setQ]=useState('')
 const[plan,setPlan]=useState('')
 const[status,setStatus]=useState('')
 const[payCfg,setPayCfg]=useState(false)
 const[payHist,setPayHist]=useState<{id:string;name:string;rows:any[]}|null>(null)

 const load=()=>{
  const qs=new URLSearchParams()
  if(q.trim())qs.set('q',q.trim())
  if(plan)qs.set('plan',plan)
  if(status)qs.set('status',status)
  const url='/api/platform/hospitals'+(qs.toString()?'?'+qs:'')
  call(url).then(x=>{setRows(x.hospitals);setStats(x.stats);setPayCfg(!!x.paymentsConfigured)}).catch(()=>setRows(null))
  call('/api/platform/incidents').then(setInc).catch(()=>{})
 }
 useEffect(()=>{load()},[])

 const act=async(id:string,b:any)=>{try{await call('/api/platform/hospitals/'+id+'/lifecycle','POST',b);load()}catch(e:any){setMsg(e.message)}}
 const openPay=async(h:any)=>{try{const x=await call('/api/platform/hospitals/'+h.id+'/payments');setPayHist({id:h.id,name:h.name,rows:x.payments||[]})}catch(e:any){setMsg(e.message)}}

 if(!rows)return (
  <main className="authPage">
   <section className="authCard">
    <span className="overline">SAAS OWNER · PLATFORM</span>
    <h1>Platform sign-in</h1>
    <p className="muted">For the product owner only. Hospital admins and staff use the normal hospital login — this console is separate and cannot be opened with a hospital account.</p>
    <form className="authForm" onSubmit={async e=>{e.preventDefault();try{await call('/api/platform/login','POST',formObj(e));load()}catch(er:any){setMsg(er.message)}}}>
     <label>Platform admin email<input name="email" type="email" required autoComplete="username"/></label>
     <label>Password<input name="password" type="password" required autoComplete="current-password"/></label>
     <button className="primary full">Sign in</button>
     {msg&&<div className="authMessage" role="alert">{msg}</div>}
    </form>
   </section>
  </main>
 )

 return (
  <main className="plat">
   <div className="platHead">
    <div>
     <span className="overline">SAAS OWNER CONSOLE</span>
     <h1>Hospitals onboarded</h1>
     <p className="muted">Product analytics for you only — not visible to hospital admins, staff or patients. No hospital role can reach this page even by URL.</p>
    </div>
    <nav className="platNav">
     <Link href="/platform/payments">Payment check</Link>
     <Link href="/platform/settings">Gateway settings</Link>
     <Link href="/platform/leads">Sales leads</Link>
    </nav>
   </div>

   {stats&&<div className="platStats">
    <div className="platStat"><b>{stats.total}</b><small>Total hospitals</small></div>
    <div className="platStat"><b>{stats.trial}</b><small>Trial</small></div>
    <div className="platStat"><b>{stats.active}</b><small>Active (paid)</small></div>
    <div className="platStat"><b>{stats.held}</b><small>On hold</small></div>
    <div className="platStat"><b>{stats.expired}</b><small>Expired / cancelled</small></div>
    <div className="platStat"><b>{stats.plan_clinic}</b><small>Clinic</small></div>
    <div className="platStat"><b>{stats.plan_basic}</b><small>Basic</small></div>
    <div className="platStat"><b>{stats.plan_ai}</b><small>AI + Engagement</small></div>
    <div className="platStat"><b>{stats.paid_via_razorpay}</b><small>Paid via Razorpay</small></div>
   </div>}

   <p><small>Razorpay checkout: {payCfg?'configured':'not configured'} · <Link href="/platform/settings">Gateway settings</Link>.</small></p>
   {msg&&<p className="err">{msg}</p>}

   <form className="platFilters" onSubmit={e=>{e.preventDefault();load()}}>
    <label>Search<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name, code, admin e-mail"/></label>
    <label>Plan<select value={plan} onChange={e=>setPlan(e.target.value)}><option value="">All</option><option value="clinic">Clinic</option><option value="basic">Basic</option><option value="ai_engage">AI + Engagement</option></select></label>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All</option>{['trialing','active','on_hold','past_due','cancelled','expired'].map(s=><option key={s}>{s}</option>)}</select></label>
    <button className="primary" type="submit">Filter</button>
    <button type="button" onClick={()=>{setQ('');setPlan('');setStatus('');call('/api/platform/hospitals').then(x=>{setRows(x.hospitals);setStats(x.stats);setPayCfg(!!x.paymentsConfigured)}).catch(e=>setMsg(e.message))}}>Reset</button>
   </form>

   <div className="platTableWrap">
    <table className="dataTable">
     <thead><tr>
      <th>Hospital</th><th>Code</th><th>Plan</th><th>Status</th>
      <th>Sub start</th><th>Trial / expiry</th><th>Payment</th><th>Admin contact</th>
      <th>Users</th><th>Lifecycle</th><th>Change</th>
     </tr></thead>
     <tbody>{rows.map(h=>{
      const start=h.current_period_start||(h.sub_status==='trialing'?h.created_at:null)
      const end=h.current_period_end||h.trial_ends_at
      return <tr key={h.id}>
       <td><b>{h.name}</b>{h.status!=='active'&&<div><small className="err">tenant deactivated</small></div>}<div><Link className="chip" href={'/platform/hospitals/'+h.id}>Detail</Link></div></td>
       <td><code>{h.code}</code></td>
       <td>{PLAN_LABEL[h.plan_code]||h.plan_code||'—'}</td>
       <td><span className="pill">{h.sub_status||'—'}</span></td>
       <td>{d(start)}</td>
       <td>{d(end)}{h.billing_period&&<div><small>{h.billing_period}</small></div>}</td>
       <td>{h.last_payment_id?<><small>Razorpay</small><div><code style={{fontSize:11}}>{String(h.last_payment_id).slice(0,14)}…</code></div></>:h.provider||'—'}<div><button type="button" className="chip" onClick={()=>openPay(h)}>Ledger</button> <Link className="chip" href={'/platform/payments?hospitalId='+h.id}>Payments</Link></div></td>
       <td><div className="platAdmin"><span>{h.admin_name||'—'}</span><small>{h.admin_email||h.contact_email||'—'}</small>{h.contact_phone&&<small>{h.contact_phone}</small>}</div></td>
       <td>{h.users}</td>
       <td>
        <small>{h.purged_at?'purged '+d(h.purged_at):h.hold_started_at?'on hold since '+d(h.hold_started_at):'trial ends '+d(h.trial_ends_at)}</small>
        <div className="chips">
         <button className="chip" type="button" onClick={()=>act(h.id,{action:'extend',what:'trial',days:30})}>+30d trial</button>
         <button className="chip" type="button" onClick={()=>act(h.id,{action:'extend',what:'hold',days:30})}>+30d hold</button>
         <button className="chip" type="button" onClick={()=>{if(window.confirm('Change tenant status of '+h.name+'?'))act(h.id,{action:'status',status:h.status==='active'?'deactivated':'active'})}}>{h.status==='active'?'Deactivate':'Reactivate'}</button>
        </div>
       </td>
       <td>
        <form onSubmit={async e=>{e.preventDefault();try{await call('/api/platform/hospitals/'+h.id,'PATCH',formObj(e));load()}catch(er:any){setMsg(er.message)}}}>
         <select name="planCode" defaultValue={h.plan_code||'basic'}><option value="clinic">clinic</option><option value="basic">basic</option><option value="ai_engage">ai_engage</option></select>
         <select name="status" defaultValue={h.sub_status||'trialing'}>{['trialing','active','on_hold','past_due','cancelled','expired'].map(s=><option key={s}>{s}</option>)}</select>
         <button type="submit">Save</button>
        </form>
       </td>
      </tr>})}
     </tbody>
    </table>
   </div>
   {rows.length===0&&<p>No hospitals match.</p>}

   {payHist&&<section className="panel modulePanel" style={{marginTop:24}}>
    <div className="platHead"><h2>Payment ledger — {payHist.name}</h2><button type="button" onClick={()=>setPayHist(null)}>Close</button></div>
    <p className="muted"><small>Hospital plan subscriptions only (Clinic / Basic / AI+). Patient bills are not on this gateway.</small></p>
    <table className="dataTable"><thead><tr><th>Date</th><th>Plan</th><th>Period</th><th>Amount</th><th>Status</th><th>Razorpay payment id</th><th>Order</th></tr></thead>
     <tbody>{payHist.rows.length===0&&<tr><td colSpan={7}>No plan payments yet.</td></tr>}
      {payHist.rows.map((r:any)=><tr key={r.id}><td>{dt(r.paid_at)}</td><td>{PLAN_LABEL[r.plan_code]||r.plan_code}</td><td>{r.billing_period}</td><td>₹{Number(r.amount_inr).toLocaleString('en-IN')}</td><td>{r.status}</td><td><code>{r.provider_payment_id||'—'}</code></td><td><code>{r.provider_order_id||'—'}</code></td></tr>)}
     </tbody></table>
   </section>}

   <h2 style={{marginTop:32}}>Incidents</h2>
   {inc&&<p><small>GitHub issues: {inc.configured.github?'on':'off'} · Tech e-mail: {inc.configured.email?'on':'off'}</small></p>}
   <table className="dataTable"><thead><tr><th>Last seen</th><th>Source</th><th>Route</th><th>Message</th><th>Tenant</th><th>Role</th><th>Count</th><th>Issue</th><th>Status</th></tr></thead>
    <tbody>{(inc?.incidents||[]).map((i:any)=><tr key={i.id}><td>{dt(i.last_seen)}</td><td>{i.source}</td><td><code>{i.route}</code></td><td>{i.message}{i.notify_error&&<div><small>notify: {i.notify_error}</small></div>}</td><td>{i.hospital_code||'—'}</td><td>{i.role||'—'}</td><td>{i.count}</td><td>{i.github_issue_url?<a href={i.github_issue_url} target="_blank" rel="noreferrer">issue</a>:'—'}</td><td><select defaultValue={i.status} onChange={async e=>{try{await call('/api/platform/incidents','PATCH',{id:i.id,status:e.target.value});load()}catch(er:any){setMsg(er.message)}}}>{['open','acknowledged','resolved','ignored'].map(s=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody>
   </table>
   {inc&&!inc.incidents.length&&<p>No incidents recorded.</p>}
  </main>
 )
}
