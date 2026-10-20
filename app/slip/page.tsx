'use client'
import {Suspense,useEffect,useState} from 'react';import {useSearchParams} from 'next/navigation';import {call} from '@/lib/client'
function Slip(){const sp=useSearchParams();const[r,setR]=useState<any>(null),[me,setMe]=useState<any>(null),[err,setErr]=useState(''),[copied,setCopied]=useState(false)
 useEffect(()=>{const id=sp.get('patient');call('/api/auth/me').then(setMe).catch(()=>location.replace('/auth/login'));if(id)call('/api/patients/'+id).then(p=>call('/api/assistant?q='+encodeURIComponent(p.patient.uhid))).then(setR).catch(e=>setErr(e.message))},[sp])
 if(err)return <main className="slip"><p>{err}</p></main>;if(!r||!me)return <main className="slip">Loading…</main>
 const url=`${location.origin}/status?h=${me.hospital.code}&id=${encodeURIComponent(r.patient.uhid)}`
 const share=`${me.hospital.name}: ${r.patient.full_name} (${r.patient.uhid}). Next: ${r.journey.nextStep} Where: ${r.journey.where}. Live status: ${url}`
 const phone=String(r.patient.mobile||'').replace(/\D/g,'')
 return <main className="slip"><header><b>{me.hospital.name}</b><small>Patient next-steps slip</small></header>
 <h1>{r.patient.full_name}</h1><p>UHID <b>{r.patient.uhid}</b>{r.sections.visit&&<> · Token <b>#{r.sections.visit.token}</b> · {r.sections.visit.doctor}</>}</p>
 <div className="slipBox"><small>CURRENT STAGE</small><h2>{r.journey.label}</h2><small>NEXT STEP</small><p className="lg">{r.journey.nextStep}</p><small>WHERE TO GO</small><p className="lg">📍 {r.journey.where}</p></div>
 <p>Check live status: <b>{url}</b> (enter your registered phone number)</p>
 <div className="noPrint"><button className="primary" onClick={()=>window.print()}>Print</button>{phone&&<a className="chip" href={'https://wa.me/'+phone+'?text='+encodeURIComponent(share)} target="_blank" rel="noreferrer">Share on WhatsApp</a>}<button onClick={async()=>{await navigator.clipboard?.writeText(share);setCopied(true)}}>{copied?'Copied':'Copy text'}</button></div></main>}
export default function Page(){return <Suspense><Slip/></Suspense>}
