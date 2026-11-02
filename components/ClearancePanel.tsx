'use client'
import {useEffect,useState} from 'react'
import {call,dt} from '@/lib/client'
import {withBase} from '@/lib/basePath'
import {toast,toastErr} from '@/lib/toast'
const STATUS:Record<string,[string,string]>={not_involved:['Not involved','na'],pending:['Open items','bad'],ready:['Ready to sign','warn'],signed:['Cleared','ok'],hold:['On hold','bad'],reopened:['New work, sign again','bad']}
const MARK:Record<string,string>={ok:'✓',fail:'✕',info:'•'}
/** Patient clearance checklist: one row per department with its open items and sign-off. Billing issues the clearance at the end. */
export default function ClearancePanel({patientId,onChange}:{patientId:string;onChange?:()=>void}){const[v,setV]=useState<any>(null),[busy,setBusy]=useState(''),[note,setNote]=useState<Record<string,string>>({}),[showNa,setShowNa]=useState(false)
 const load=()=>call('/api/clearance?patientId='+patientId).then(setV).catch(toastErr);useEffect(()=>{setV(null);load()},[patientId])
 async function act(action:string,extra:any={},ok=''){setBusy(action+(extra.department||''));try{const x=await call('/api/clearance','POST',{patientId,action,...extra});setV(x);if(x.issued)toast('Clearance issued · '+x.issued);else if(ok)toast(ok);onChange?.()}catch(e){toastErr(e);load()}finally{setBusy('')}}
 if(!v)return <div className="clr card"><p className="muted">Loading clearance…</p></div>
 const depts=v.departments.filter((d:any)=>showNa||d.involved),hidden=v.departments.length-v.departments.filter((d:any)=>d.involved).length
 const isBilling=['admin','billing','reception'].includes(v.role),bill=v.departments.find((d:any)=>d.key==='billing')
 return <section className="clr card" aria-label="Patient clearance">
  <header className="clrHead"><div><span className="overline">PATIENT CLEARANCE · NO DUES</span><h2>{v.patient.full_name} <small>{v.patient.uhid}</small></h2>
   <p className="muted">{v.clearance?<>Started {dt(v.clearance.requestedAt)} · {v.progress.done} of {v.progress.needed} department{v.progress.needed===1?'':'s'} cleared</>:v.lastCleared?<>Last clearance <b>{v.lastCleared.clearanceNo}</b> · {dt(v.lastCleared.at)}{v.lastCleared.by?' · '+v.lastCleared.by:''}</>:'No clearance started. Start it when the patient is ready to leave or be discharged.'}</p></div>
   {v.clearance&&<div className="clrBar" role="progressbar" aria-valuemin={0} aria-valuemax={v.progress.needed} aria-valuenow={v.progress.done}><i style={{width:(v.progress.needed?100*v.progress.done/v.progress.needed:100)+'%'}}/></div>}
   {v.canRequest&&<button className="primary" disabled={!!busy} onClick={()=>act('request',{},'Clearance started. Departments can now sign off.')}>Start clearance</button>}
  </header>
  <ol className="clrList">{depts.map((d:any)=>{const [label,tone]=STATUS[d.status]||[d.status,'na'];return <li key={d.key} className={'clrDept '+tone}>
   <div className="clrRow"><b>{d.label}</b><span className={'clrPill '+tone}>{label}</span>{d.signoff&&<small className="muted">{d.signoff.status==='hold'?'Hold':'Signed'} by {d.signoff.by} · {dt(d.signoff.at)}{d.signoff.note?' · “'+d.signoff.note+'”':''}</small>}</div>
   {d.items.length>0&&<ul className="clrItems">{d.items.map((i:any,k:number)=><li key={k} className={i.level}><span aria-hidden="true">{MARK[i.level]}</span>{i.link?<a href={withBase(i.link)}>{i.text}</a>:i.text}</li>)}</ul>}
   {d.key==='billing'&&v.clearance&&isBilling&&d.openItems>0&&<div className="actionRow"><button disabled={!!busy} onClick={()=>act('bill',{},'Pending charges billed')}>Bill all pending charges</button><a className="chip" href={withBase('/billing?patient='+v.patient.id)}>Open bill &amp; collect</a></div>}
   {d.canSign&&d.status!=='signed'&&<div className="clrSign"><input aria-label={'Note for '+d.label} placeholder={d.openItems?'Required: why clear with open items?':'Note (optional)'} value={note[d.key]||''} onChange={e=>setNote(n=>({...n,[d.key]:e.target.value}))}/>
    <button className="primary" disabled={!!busy||(d.openItems>0&&!note[d.key])} onClick={()=>act('sign',{department:d.key,note:note[d.key]},d.label+' cleared')}>Confirm clear</button>
    <button className="ghost" disabled={!!busy||!note[d.key]} title="Write the reason first" onClick={()=>act('hold',{department:d.key,note:note[d.key]},d.label+' put on hold')}>Hold</button></div>}
  </li>})}</ol>
  {hidden>0&&<button className="linkBtn" onClick={()=>setShowNa(s=>!s)}>{showNa?'Hide':'Show'} {hidden} department{hidden===1?'':'s'} not involved</button>}
  {v.clearance&&<footer className="clrFoot">{v.blockers.length?<p className="muted"><b>Before billing can issue the clearance:</b> {v.blockers.join(' · ')}</p>:<p className="ok"><b>All departments cleared and no dues.</b></p>}
   {isBilling&&<div className="actionRow"><button className="primary xlBtn" disabled={!!busy||!v.canFinalize} onClick={()=>act('finalize')}>Issue clearance</button>{bill&&<button className="ghost" disabled={!!busy} onClick={()=>{if(confirm('Cancel this clearance? Sign-offs are kept in the audit log.'))act('cancel',{},'Clearance cancelled')}}>Cancel</button>}</div>}</footer>}
  {!v.clearance&&v.lastCleared&&<div className="actionRow"><a className="chip" href={withBase('/clearance?patient='+v.patient.id+'&print=1')}>Print clearance slip</a></div>}
 </section>}
