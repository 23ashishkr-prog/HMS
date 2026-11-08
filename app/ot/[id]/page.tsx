'use client'
import {useEffect,useState} from 'react';import {useParams} from 'next/navigation';import {call} from '@/lib/client'
import {PHASES,WHO} from '@/lib/otChecklist'
const d=(s?:string|null)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'
const age=(dob?:string|null)=>{if(!dob)return '';const b=new Date(dob),n=new Date();let y=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))y--;return y+' y'}
const ANAES:Record<string,string>={general:'General',spinal:'Spinal',epidural:'Epidural',regional:'Regional block',local:'Local',sedation:'Sedation',none:'None'}
const ST:Record<string,string>={scheduled:'Scheduled',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'}
/** Printable operative note with the WHO Surgical Safety Checklist record. Staff only (signed in). */
export default function Page(){const {id}=useParams<{id:string}>();const[x,setX]=useState<any>(null),[err,setErr]=useState('')
 useEffect(()=>{call('/api/ot/'+id).then(setX).catch((e:any)=>setErr(e.message))},[id])
 if(err)return <main className="dsPage"><p className="err">{err}</p></main>
 if(!x)return <main className="dsPage"><p>Loading…</p></main>
 const {hospital:h,surgery:s}=x;const P=(t:string,v:any,pre=true)=>v?<section><h3>{t}</h3><p className={pre?'pre':''}>{v}</p></section>:null
 return <main className="dsPage"><div className="dsBar noPrint"><button className="primary" onClick={()=>window.print()}>Print / save as PDF</button></div>
 <article className="dsSheet">
 <header className="dsHead">{h.logoUrl&&<img src={h.logoUrl} alt=""/>}<div><h1>{h.name}</h1><small>{[h.address,h.phone,h.email].filter(Boolean).join(' · ')}</small></div></header>
 <h2 className="dsTitle">Operative note{s.status!=='completed'&&<span className="pill warnPill"> draft · {ST[s.status].toLowerCase()}</span>}</h2>
 <section className="dsGrid"><div><span>Patient</span><b>{s.patient}</b></div><div><span>UHID</span><b>{s.uhid}</b></div><div><span>Age / sex</span><b>{[age(s.date_of_birth),s.gender].filter(Boolean).join(' / ')||'—'}</b></div><div><span>IP number</span><b>{s.admission_no||'—'}</b></div>
 <div><span>Procedure</span><b>{s.procedure_name}</b></div><div><span>OT room</span><b>{s.room}</b></div><div><span>Priority</span><b>{s.priority==='emergency'?'Emergency':'Elective'}</b></div><div><span>Anaesthesia</span><b>{ANAES[s.anaesthesia_type]||'—'}</b></div>
 <div><span>Surgeon</span><b>{s.surgeon}</b></div><div><span>Anaesthetist</span><b>{s.anaesthetist||'—'}</b></div><div><span>Assistants</span><b>{s.assistants.join(', ')||'—'}</b></div><div><span>Blood loss</span><b>{s.blood_loss_ml!=null?s.blood_loss_ml+' ml':'—'}</b></div>
 <div><span>Started</span><b>{d(s.actual_start)}</b></div><div><span>Finished</span><b>{d(s.actual_end)}</b></div></section>
 {P('Pre-operative diagnosis',s.pre_op_diagnosis)}{P('Post-operative diagnosis',s.post_op_diagnosis)}{P('Findings',s.findings)}{P('Procedure details',s.procedure_details)}
 {s.implants?.length>0&&<section><h3>Implants</h3><table className="dsTable keepTable"><thead><tr><th>Implant</th><th>Size</th><th>Lot / serial</th><th>Qty</th></tr></thead><tbody>{s.implants.map((m:any,k:number)=><tr key={k}><td>{m.name}</td><td>{m.size||''}</td><td>{m.lot||''}</td><td>{m.qty}</td></tr>)}</tbody></table></section>}
 <section><h3>Complications</h3><p className="pre">{s.complications||'None recorded'}</p></section>
 {P('Post-operative instructions',s.post_op_instructions)}
 <section><h3>WHO Surgical Safety Checklist</h3><table className="dsTable keepTable"><tbody>{PHASES.map(p=>{const c=s.checklist[p.id];return <tr key={p.id}><td><b>{p.label}</b><br/><small>{p.when}</small></td><td>{c.complete?`Done · ${c.by} · ${d(c.at)}`:`Not complete (${WHO[p.id].length-c.missing.length}/${WHO[p.id].length})`}{c.answers?.note?<><br/><small>Note: {c.answers.note}</small></>:null}</td></tr>})}</tbody></table></section>
 <footer className="dsFoot"><div><span>Surgeon's signature</span><b>{s.surgeon}</b></div><small>Note by {s.note_name||'—'} · {d(s.note_at)}</small></footer>
 </article></main>}
