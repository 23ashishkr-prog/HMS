'use client'
import {useEffect,useRef,useState} from 'react';import {useRouter} from 'next/navigation';import {call,inr,dt} from '@/lib/client'
const STAGES=['registered','waiting_doctor','in_consultation','lab_pending','pharmacy_pending','billing_pending','done']
/** Floating role-aware assistant. Type or scan (barcode scanners type + Enter) a UHID, today's token, or phone. */
export default function Assistant(){const router=useRouter();const[open,setOpen]=useState(false),[q,setQ]=useState(''),[r,setR]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[ask,setAsk]=useState(''),[ans,setAns]=useState('');const ref=useRef<HTMLInputElement>(null)
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='j'){e.preventDefault();setOpen(o=>!o)}if(e.key==='Escape')setOpen(false)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[])
 useEffect(()=>{if(open)setTimeout(()=>ref.current?.focus(),50)},[open])
 async function look(v=q){if(!v.trim())return;setBusy(true);setErr('');setAns('');try{setR(await call('/api/assistant?q='+encodeURIComponent(v)))}catch(e:any){setErr(e.message);setR(null)}finally{setBusy(false)}}
 async function askAI(){try{const x=await call('/api/assistant/ask','POST',{q,question:ask});setAns(x.answer)}catch(e:any){setAns(e.message)}}
 const j=r?.journey,sec=r?.sections||{}
 return <><button className="fab" onClick={()=>setOpen(o=>!o)} title="Patient assistant (Ctrl J)" aria-label="Open patient assistant"><svg viewBox="0 0 24 24" width="26" height="26"><path fill="#fff" d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.8V17a1 1 0 0 1-1 1h-1v2.5a1.5 1.5 0 0 1-3 0V18h-1a1 1 0 0 1-1-1v-2.2A7 7 0 0 1 12 2zm-2.5 6.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm5 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg></button>
 {open&&<aside className="assist glass" role="dialog" aria-label="Patient assistant"><div className="assistHead"><b>Patient assistant</b><small>UHID · token · phone · Ctrl J</small><button className="ghost" onClick={()=>setOpen(false)}>✕</button></div>
 <form onSubmit={e=>{e.preventDefault();look()}} className="assistSearch"><input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Scan or type UHID / token # / phone"/><button className="primary" disabled={busy}>{busy?'…':'Go'}</button></form>
 {err&&<p className="err">{err}</p>}
 {r?.matches&&(r.matches.length===0?<p className="muted">No patient found in your hospital.</p>:<div className="hitList">{r.matches.map((m:any)=><button key={m.id} onClick={()=>{setQ(m.uhid);look(m.uhid)}}><b>{m.full_name}</b><span>{m.uhid}</span><span>{m.token_no?'#'+m.token_no+' '+m.doctor:m.mobile||''}</span><span className="pill">Open</span></button>)}</div>)}
 {j&&<div className="assistBody"><div className="ptLine"><b>{r.patient.full_name}</b><small>{r.patient.uhid} · {r.patient.mobile||'—'}</small></div>
 <div className="stageBar">{STAGES.map(s=><i key={s} className={s===j.stage?'on':STAGES.indexOf(s)<STAGES.indexOf(j.stage)?'past':''} title={s.replace('_',' ')}/>)}</div>
 <span className={'stageChip '+j.stage}>{j.label}</span>
 <div className="nextStep"><small>NEXT STEP</small><p>{j.nextStep}</p><small>WHERE</small><p>📍 {j.where}</p></div>
 {r.actions.length>0&&<div className="chips">{r.actions.map((a:any)=><button key={a.href+a.label} className="chip on" onClick={()=>{setOpen(false);router.push(a.href)}}>{a.label}</button>)}</div>}
 {sec.visit&&<p className="kv">Token <b>#{sec.visit.token}</b> · {sec.visit.doctor} · {sec.visit.status}</p>}
 {sec.billing&&<p className="kv">Balance <b>{inr(sec.billing.balance)}</b>{sec.billing.unbilled.length>0&&<> · unbilled: {sec.billing.unbilled.map((u:any)=>u.description+' '+inr(u.price)).join(', ')}</>}</p>}
 {sec.ipd&&<p className="kv">IPD <b>{sec.ipd.ward} · {sec.ipd.bed_no}</b> ({sec.ipd.admission_no})</p>}
 {sec.clinical&&<div className="kv">{sec.clinical.vitals&&<p>Vitals {dt(sec.clinical.vitals.recorded_at)}: T {sec.clinical.vitals.temperature_c??'—'} · P {sec.clinical.vitals.pulse??'—'} · BP {sec.clinical.vitals.bp_systolic??'—'}/{sec.clinical.vitals.bp_diastolic??'—'} · SpO₂ {sec.clinical.vitals.spo2??'—'}</p>}{sec.clinical.diagnoses.length>0&&<p>Dx: {sec.clinical.diagnoses.map((d:any)=>(d.icd10_code?d.icd10_code+' ':'')+d.description).join('; ')}</p>}{sec.clinical.activeMeds.length>0&&<p>Meds: {sec.clinical.activeMeds.map((m:any)=>m.medicine_name+' '+(m.frequency||'')).join(', ')}</p>}</div>}
 {sec.demographics?.allergies&&<p className="alert">⚠ Allergies: {sec.demographics.allergies}</p>}
 {sec.orders?.length>0&&<p className="kv">Pending: {sec.orders.map((o:any)=>o.test_name+' ('+o.status.replace('_',' ')+')').join(', ')}</p>}
 {sec.pharmacy?.length>0&&<p className="kv">{sec.pharmacy.length} prescription(s) to dispense</p>}
 <details><summary>Ask a question (AI, if enabled)</summary><div className="assistSearch"><input value={ask} onChange={e=>setAsk(e.target.value)} placeholder="e.g. what is pending for this patient?"/><button onClick={askAI}>Ask</button></div>{ans&&<p className="muted">{ans}</p>}</details>
 </div>}</aside>}</>}
