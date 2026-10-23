'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call,dt} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

const PLAN:Record<string,string>={clinic:'Clinic',basic:'Basic',ai_engage:'AI + Engagement'}

export default function HospitalsPage(){
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 const[q,setQ]=useState('')
 const[status,setStatus]=useState('')
 const[plan,setPlan]=useState('')
 const[msg,setMsg]=useState('')
 const[openMenu,setOpenMenu]=useState<string|null>(null)

 const load=(opts?:{q?:string;status?:string;plan?:string})=>{
  const qs=new URLSearchParams()
  const Q=opts?.q??q,S=opts?.status??status,P=opts?.plan??plan
  if(Q.trim())qs.set('q',Q.trim())
  if(S)qs.set('status',S)
  if(P)qs.set('plan',P)
  call('/api/platform/hospitals'+(qs.toString()?'?'+qs:'')).then(setD).catch((e:any)=>setErr(e.message))
 }
 useEffect(()=>{load()},[])

 if(err&&!d)return <PlatformSignIn title="Hospitals" hint="Sign in as platform owner to manage tenants."/>
 if(!d)return <main className="plat"><p>Loading…</p></main>

 const act=async(id:string,body:any)=>{
  setMsg('');setOpenMenu(null)
  try{await call('/api/platform/hospitals/'+id+'/lifecycle','POST',body);load()}
  catch(e:any){setMsg(e.message)}
 }

 const rows=d.hospitals||[]

 return (
  <PlatformShell
   title="Hospitals"
   eyebrow="SAAS OWNER · TENANTS"
   description="Live hospital tenants — open a hospital for payment ledger and plan/status changes."
  >
   {msg&&<p className="err">{msg}</p>}
   <form className="platFilters" onSubmit={e=>{e.preventDefault();load()}}>
    <label>Search<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name or code"/></label>
    <label>Status
     <select value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="">All</option>
      {['trialing','active','on_hold','past_due','cancelled','expired'].map(s=><option key={s} value={s}>{s}</option>)}
     </select>
    </label>
    <label>Plan
     <select value={plan} onChange={e=>setPlan(e.target.value)}>
      <option value="">All</option>
      <option value="clinic">Clinic</option>
      <option value="basic">Basic</option>
      <option value="ai_engage">AI+</option>
     </select>
    </label>
    <div className="platFilterBtns">
     <button className="primary" type="submit">Filter</button>
     <button type="button" onClick={()=>{setQ('');setStatus('');setPlan('');load({q:'',status:'',plan:''})}}>Reset</button>
    </div>
   </form>

   {/* Desktop table */}
   <div className="platTableWrap platDesktopOnly">
    <table className="dataTable platHospTable">
     <thead><tr>
      <th>Hospital</th><th>Code</th><th>Plan</th><th>Status</th><th>Start</th><th>Expiry</th><th>Admin</th><th></th>
     </tr></thead>
     <tbody>
      {rows.length===0&&<tr><td colSpan={8}>No hospitals match.</td></tr>}
      {rows.map((h:any)=>(
       <tr key={h.id}>
        <td><Link href={'/platform/hospitals/'+h.id}><b>{h.name}</b></Link>{h.status!=='active'&&<div><small className="err">tenant off</small></div>}</td>
        <td><code>{h.code}</code></td>
        <td>{PLAN[h.plan_code]||h.plan_code||'—'}</td>
        <td><span className={'pill pill-'+h.sub_status}>{h.sub_status||'—'}</span></td>
        <td>{dt(h.current_period_start)||dt(h.created_at)}</td>
        <td>{dt(h.current_period_end)||dt(h.trial_ends_at)||'—'}</td>
        <td className="platAdmin"><b>{h.admin_name||'—'}</b><small>{h.admin_email||h.contact_email||'—'}</small></td>
        <td className="platRowActions">
         <Link className="chip" href={'/platform/hospitals/'+h.id}>Open</Link>
         <div className="platMenuWrap">
          <button type="button" className="chip" aria-expanded={openMenu===h.id} onClick={()=>setOpenMenu(openMenu===h.id?null:h.id)}>⋯</button>
          {openMenu===h.id&&(
           <div className="platMenu" role="menu">
            <button type="button" onClick={()=>act(h.id,{action:'extend',what:'trial',days:30})}>+30d trial</button>
            <button type="button" onClick={()=>act(h.id,{action:'extend',what:'hold',days:30})}>+30d hold</button>
            <button type="button" onClick={()=>{if(window.confirm('Toggle tenant active?'))act(h.id,{action:'status',status:h.status==='active'?'deactivated':'active'})}}>{h.status==='active'?'Deactivate':'Reactivate'}</button>
            <Link href={'/platform/payments?hospitalId='+h.id}>Payments</Link>
            <Link href={'/platform/hospitals/'+h.id+'#reset-admin'}>Reset admin password</Link>
           </div>
          )}
         </div>
        </td>
       </tr>
      ))}
     </tbody>
    </table>
   </div>

   {/* Mobile / tablet cards */}
   <div className="platCardList platMobileOnly">
    {rows.length===0&&<p className="muted">No hospitals match.</p>}
    {rows.map((h:any)=>(
     <article key={h.id} className="platHospCard">
      <div className="platHospCardTop">
       <div>
        <Link href={'/platform/hospitals/'+h.id}><b>{h.name}</b></Link>
        <div><code>{h.code}</code> · {PLAN[h.plan_code]||h.plan_code||'—'} · <span className={'pill pill-'+h.sub_status}>{h.sub_status||'—'}</span></div>
        {h.status!=='active'&&<small className="err">tenant deactivated</small>}
       </div>
       <Link className="chip" href={'/platform/hospitals/'+h.id}>Open</Link>
      </div>
      <dl className="platHospMeta">
       <div><dt>Start</dt><dd>{dt(h.current_period_start)||dt(h.created_at)||'—'}</dd></div>
       <div><dt>Expiry</dt><dd>{dt(h.current_period_end)||dt(h.trial_ends_at)||'—'}</dd></div>
       <div><dt>Admin</dt><dd>{h.admin_name||'—'}<br/><small>{h.admin_email||h.contact_email||'—'}</small></dd></div>
      </dl>
      <details className="platHospMore">
       <summary>Actions</summary>
       <div className="chips">
        <button type="button" className="chip" onClick={()=>act(h.id,{action:'extend',what:'trial',days:30})}>+30d trial</button>
        <button type="button" className="chip" onClick={()=>act(h.id,{action:'extend',what:'hold',days:30})}>+30d hold</button>
        <button type="button" className="chip" onClick={()=>{if(window.confirm('Toggle tenant?'))act(h.id,{action:'status',status:h.status==='active'?'deactivated':'active'})}}>{h.status==='active'?'Deactivate':'Reactivate'}</button>
        <Link className="chip" href={'/platform/payments?hospitalId='+h.id}>Payments</Link>
       </div>
      </details>
     </article>
    ))}
   </div>
  </PlatformShell>
 )
}
