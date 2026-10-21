'use client'
import {useEffect,useState} from 'react';import {call} from '@/lib/client'
/** Aqua Dynamics: compact live-activity pill that morphs open to show more. Polls every 20 s while visible. */
export default function LivePill(){const[d,setD]=useState<any>(null),[open,setOpen]=useState(false)
 useEffect(()=>{let t:any;const go=()=>{if(document.visibilityState==='visible')call('/api/home/live').then(setD).catch(()=>{})};go();t=setInterval(go,20000);return()=>clearInterval(t)},[])
 if(!d)return null
 const live=d.waiting>0||d.serving!=null
 const short=live?<>OPD live · <b>{d.waiting}</b> waiting{d.nextToken!=null&&<> · next <b>#{d.nextToken}</b></>}</>:d.pendingLabs?<>Lab · <b>{d.pendingLabs}</b> pending</>:<>All clear · no queue</>
 return <div className={'aquaPill'+(open?' open':'')+(live?' live':'')} role="button" tabIndex={0} aria-expanded={open} aria-label="Live activity" onClick={()=>setOpen(o=>!o)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(o=>!o)}}}>
  <div className="apShort"><span className="apDot"/><span>{short}</span></div>
  <div className="apMore" aria-hidden={!open}>
   <div className="apGrid"><div><small>Now serving</small><b>{d.serving!=null?'#'+d.serving:'—'}</b></div><div><small>Next token</small><b>{d.nextToken!=null?'#'+d.nextToken:'—'}</b></div><div><small>Waiting</small><b>{d.waiting}</b></div><div><small>Pending labs</small><b>{d.pendingLabs}</b></div></div>
   {d.nextAppointment&&<p className="apNext">Next appointment {d.nextAppointment.time} · {d.nextAppointment.name}</p>}
   <div className="apLinks"><a href="/queue" data-app onClick={e=>e.stopPropagation()}>Open queue</a><a href="/laboratory" data-app onClick={e=>e.stopPropagation()}>Lab worklist</a></div></div></div>}
