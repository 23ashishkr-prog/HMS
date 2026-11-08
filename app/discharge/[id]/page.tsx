'use client'
import {useEffect,useState} from 'react';import {useParams,useSearchParams} from 'next/navigation';import {Suspense} from 'react'
import {withBase} from '@/lib/basePath';import {call} from '@/lib/client'
const TYPE:Record<string,string>={normal:'Discharged',lama:'Left against medical advice (LAMA)',referred:'Referred to another hospital',death:'Death'}
const d=(s?:string|null)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'
const day=(s?:string|null)=>s?new Date(String(s).slice(0,10)+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'
const age=(dob?:string|null)=>{if(!dob)return '';const b=new Date(dob),n=new Date();let y=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))y--;return y+' y'}
/** Printable discharge summary. Staff open it signed in; patients open it from the signed WhatsApp link (?e=&s=). */
function Summary(){const {id}=useParams<{id:string}>();const sp=useSearchParams();const[x,setX]=useState<any>(null),[err,setErr]=useState('')
 useEffect(()=>{const e=sp.get('e'),s=sp.get('s');const p=e&&s?fetch(withBase(`/api/discharge/${id}?e=${e}&s=${encodeURIComponent(s)}`),{cache:'no-store'}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Not found');return j}):call('/api/ipd/admissions/'+id);p.then(setX).catch((er:any)=>setErr(er.message))},[id,sp])
 if(err)return <main className="dsPage"><p className="err">{err}</p></main>
 if(!x)return <main className="dsPage"><p>Loading…</p></main>
 const {hospital:h,patient:p,admission:a,discharge:ds}=x
 return <main className="dsPage"><div className="dsBar noPrint"><button className="primary" onClick={()=>window.print()}>Print / save as PDF</button></div>
 <article className="dsSheet">
 <header className="dsHead">{h.logoUrl&&<img src={h.logoUrl} alt=""/>}<div><h1>{h.name}</h1><small>{[h.address,h.phone,h.email].filter(Boolean).join(' · ')}</small></div></header>
 <h2 className="dsTitle">Discharge summary{a.status!=='discharged'&&<span className="pill warnPill"> draft · still admitted</span>}</h2>
 <section className="dsGrid"><div><span>Patient</span><b>{p.name}</b></div><div><span>UHID</span><b>{p.uhid}</b></div><div><span>Age / sex</span><b>{[age(p.dateOfBirth),p.gender].filter(Boolean).join(' / ')||'—'}</b></div><div><span>ABHA</span><b>{p.abha||'—'}</b></div>
 <div><span>IP number</span><b>{a.no}</b></div><div><span>Ward / bed</span><b>{a.ward} · {a.bed}</b></div><div><span>Admitted</span><b>{d(a.admittedAt)}</b></div><div><span>Discharged</span><b>{d(a.dischargedAt)}</b></div>
 <div><span>Consultant</span><b>{a.doctor}{a.doctorReg?' · Reg '+a.doctorReg:''}</b></div><div><span>Discharge type</span><b>{TYPE[ds.type]||ds.type}</b></div><div><span>Clearance</span><b>{ds.clearanceNo||(ds.override?'Not cleared (admin override)':'—')}</b></div><div><span>Follow-up</span><b>{day(ds.followUpDate)}</b></div></section>
 {a.reason&&<section><h3>Reason for admission</h3><p>{a.reason}</p></section>}
 <section><h3>Final diagnosis</h3><p>{ds.diagnosis||'—'}</p></section>
 <section><h3>Course in hospital</h3><p className="pre">{ds.summary||'—'}</p></section>
 {ds.treatment&&<section><h3>Treatment and procedures</h3><p className="pre">{ds.treatment}</p></section>}
 {x.investigations?.length>0&&<section><h3>Investigations</h3><table className="dsTable keepTable"><thead><tr><th>Test</th><th>Result</th></tr></thead><tbody>{x.investigations.map((i:any,k:number)=><tr key={k}><td>{i.test_name}</td><td>{i.result_text||i.status}</td></tr>)}</tbody></table></section>}
 {ds.condition&&<section><h3>Condition at discharge</h3><p>{ds.condition}</p></section>}
 <section><h3>Medicines to take at home</h3>{ds.medications?.length?<table className="dsTable keepTable"><thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>For</th></tr></thead><tbody>{ds.medications.map((m:any,k:number)=><tr key={k}><td>{m.name}</td><td>{m.dose||''}</td><td>{m.frequency||''}</td><td>{m.duration||''}</td></tr>)}</tbody></table>:<p>None</p>}</section>
 {ds.advice&&<section><h3>Advice</h3><p className="pre">{ds.advice}</p></section>}
 {ds.override&&<section className="noPrint"><h3>Discharged before clearance</h3><p>{ds.override}</p></section>}
 <footer className="dsFoot"><div><span>Consultant's signature</span></div><small>In an emergency, come to the hospital or call {h.phone||'the hospital'}.</small></footer>
 </article></main>}
export default function Page(){return <Suspense><Summary/></Suspense>}
