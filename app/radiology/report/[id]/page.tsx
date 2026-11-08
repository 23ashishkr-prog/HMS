'use client'
import {Suspense,useEffect,useState} from 'react';import {useParams} from 'next/navigation';import {call} from '@/lib/client';import {modalityLabel} from '@/lib/radiology'
const d=(s?:string|null)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'
const age=(dob?:string|null)=>{if(!dob)return '';const b=new Date(dob),n=new Date();let y=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))y--;return y+' y'}
/** Printable radiology report (save as PDF from the browser). Draft until verified. */
function Report(){const {id}=useParams<{id:string}>();const[x,setX]=useState<any>(null),[err,setErr]=useState('')
 useEffect(()=>{call('/api/radiology/'+id).then(setX).catch((e:any)=>setErr(e.message))},[id])
 if(err)return <main className="dsPage"><p className="err">{err}</p></main>
 if(!x)return <main className="dsPage"><p>Loading…</p></main>
 const {hospital:h,study:s}=x;if(!s.findings)return <main className="dsPage"><p className="err">This study has not been reported yet.</p></main>
 return <main className="dsPage"><div className="dsBar noPrint">{s.viewer_url&&<a className="btnLink" href={s.viewer_url} target="_blank" rel="noreferrer">Open images</a>} <button className="primary" onClick={()=>window.print()}>Print / save as PDF</button></div>
 <article className="dsSheet">
 <header className="dsHead">{h.logoUrl&&<img src={h.logoUrl} alt=""/>}<div><h1>{h.name}</h1><small>{[h.address,h.phone,h.email].filter(Boolean).join(' · ')}</small></div></header>
 <h2 className="dsTitle">Radiology report · {modalityLabel(s.modality)}{s.study_status!=='verified'&&<span className="pill warnPill"> preliminary · not yet verified</span>}</h2>
 <section className="dsGrid"><div><span>Patient</span><b>{s.full_name}</b></div><div><span>UHID</span><b>{s.uhid}</b></div><div><span>Age / sex</span><b>{[age(s.date_of_birth),s.gender].filter(Boolean).join(' / ')||'—'}</b></div><div><span>Referred by</span><b>{s.ordered_by_name}</b></div>
 <div><span>Study</span><b>{s.test_name}{s.body_part?' · '+s.body_part:''}</b></div><div><span>Accession</span><b>{s.accession_no}</b></div><div><span>Images taken</span><b>{d(s.acquired_at)}</b></div><div><span>Reported</span><b>{d(s.reported_at)}</b></div></section>
 {s.contrast&&<section><h3>Contrast</h3><p>{s.contrast_agent||'Yes'}{s.creatinine!=null?` · creatinine ${s.creatinine} mg/dL`:''}</p></section>}
 {s.clinical_notes&&<section><h3>Clinical details</h3><p>{s.clinical_notes}</p></section>}
 {s.technique&&<section><h3>Technique</h3><p className="pre">{s.technique}</p></section>}
 <section><h3>Findings</h3><p className="pre">{s.findings}</p></section>
 <section><h3>Impression</h3><p className="pre"><b>{s.impression}</b></p>{s.critical&&<p><b>Critical finding</b> — communicated to {s.ordered_by_name}{s.critical_ack_at?`, acknowledged ${d(s.critical_ack_at)}`:''}.</p>}</section>
 <footer className="dsFoot"><div><span>{s.radiologist_name}{s.radiologist_designation?' · '+s.radiologist_designation:''}{s.radiologist_reg?' · Reg '+s.radiologist_reg:''}</span></div><small>{s.verified_at?`Verified by ${s.verified_by_name} on ${d(s.verified_at)}.`:'Preliminary report.'} Study UID {s.study_instance_uid}</small></footer>
 </article></main>}
export default function Page(){return <Suspense><Report/></Suspense>}
