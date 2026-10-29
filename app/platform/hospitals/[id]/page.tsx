'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {useParams} from 'next/navigation'
import {call,dt,formObj} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

const PLAN:Record<string,string>={clinic:'Clinic',basic:'Basic',ai_engage:'AI + Engagement'}
function trialLeft(iso?:string|null){if(!iso)return '—';const ms=new Date(iso).getTime()-Date.now();if(ms<=0)return '0';return String(Math.ceil(ms/86400000))}

export default function HospitalDetail(){
 const {id}=useParams<{id:string}>()
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 const[msg,setMsg]=useState('')
 const[admins,setAdmins]=useState<any[]>([])
 const[tempPw,setTempPw]=useState<any>(null)
 const[resetBusy,setResetBusy]=useState(false)
 const load=()=>call('/api/platform/hospitals/'+id).then(setD).catch((e:any)=>setErr(e.message))
 const loadAdmins=()=>call('/api/platform/hospitals/'+id+'/reset-admin-password').then((r:any)=>setAdmins(r.admins||[])).catch(()=>{})
 useEffect(()=>{if(id){load();loadAdmins()}},[id])

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
    <div className="platStat"><b>{dt(h.trial_started_at)||dt(h.created_at)}</b><small>Trial start</small></div>
    <div className="platStat"><b>{h.sub_status==='trialing'?trialLeft(h.trial_ends_at):'—'}</b><small>Trial days left</small></div>
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
     <button className="chip" type="button" onClick={()=>act({action:'extend',what:'trial',days:30})}>Extend trial 30d</button>
     <button className="chip" type="button" onClick={()=>{if(window.confirm('End the trial now? The account goes on hold. Data is not deleted.'))act({action:'end_trial'})}}>End trial</button>
     <button className="chip" type="button" onClick={()=>{if(window.confirm('Convert this hospital to a paid subscription on the current plan?'))act({action:'convert_paid'})}}>Convert to paid</button>
     <button className="chip" type="button" onClick={()=>{if(window.confirm('Clear the one-trial block so this organisation can register a trial again?'))act({action:'reset_trial_block'})}}>Reset trial block</button>
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

   <section id="reset-admin" className="panel modulePanel" style={{marginTop:24}}>
    <h2>Reset hospital admin password</h2>
    <p className="muted"><small>Sets a temporary password for an admin of <b>this</b> hospital only. Shown once below — copy it and share privately. They must change it at next hospital login. The password is never e-mailed from this screen and is not written to audit logs.</small></p>
    {(admins.length?admins:[{id:'',email:h.admin_email,full_name:h.admin_name||'Primary admin',active:true}]).map((a:any)=>(
     <div key={a.id||'primary'} className="actionRow" style={{marginBottom:8,alignItems:'center'}}>
      <div style={{flex:1}}><b>{a.full_name||'—'}</b><br/><small>{a.email||'—'}</small>{a.must_change_password&&<> · <small className="muted">temp password pending</small></>}{a.active===false&&<> · <small className="err">inactive</small></>}</div>
      <button type="button" className="primary" disabled={resetBusy||a.active===false} onClick={async()=>{
        if(!window.confirm('Generate a temporary password for '+((a.full_name||a.email)||'this admin')+'? They will be forced to change it at next login.'))return
        setResetBusy(true);setTempPw(null);setMsg('')
        try{
          const r=await call('/api/platform/hospitals/'+id+'/reset-admin-password','POST',a.id?{userId:a.id}:{})
          setTempPw(r);loadAdmins()
        }catch(e:any){setMsg(e.message)}
        finally{setResetBusy(false)}
      }}>{resetBusy?'Working…':'Reset admin password'}</button>
     </div>
    ))}
    {tempPw&&(
     <div>
      <p><b>Temporary password for {tempPw.fullName||tempPw.email}</b> — copy now; it will not be shown again after you leave this page.</p>
      <div className="tempPwBox">
       <code id="plat-temp-pw">{tempPw.temporaryPassword}</code>
       <button type="button" className="chip" onClick={()=>{navigator.clipboard?.writeText(tempPw.temporaryPassword);setMsg('Copied temporary password')}}>Copy</button>
      </div>
      <p className="muted"><small>Hospital code: <code>{tempPw.hospitalCode}</code> · Login e-mail: <code>{tempPw.email}</code></small></p>
     </div>
    )}
   </section>

  </PlatformShell>
 )
}
