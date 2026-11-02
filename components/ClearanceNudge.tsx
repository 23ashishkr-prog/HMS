'use client'
import {useEffect,useState} from 'react'
import {call} from '@/lib/client'
import {withBase} from '@/lib/basePath'
/** Department desks: "N patients are waiting for your clearance sign-off". Silent when there are none. */
export default function ClearanceNudge(){const[n,setN]=useState(0)
 useEffect(()=>{let live=true;const f=()=>call('/api/clearance?mine=1').then(x=>{if(live)setN(x.clearances.length)}).catch(()=>{});f();const t=setInterval(f,60000);return()=>{live=false;clearInterval(t)}},[])
 return n>0?<a className="clrNudge" href={withBase('/clearance')} role="status"><b>{n}</b> patient{n>1?'s':''} waiting for your clearance sign-off <span aria-hidden="true">→</span></a>:null}
/** One line for discharge screens: has billing issued the clearance for this patient? */
export function ClearanceStatus({patientId}:{patientId:string}){const[v,setV]=useState<any>(null);useEffect(()=>{call('/api/clearance?patientId='+patientId).then(setV).catch(()=>{})},[patientId])
 if(!v)return null;const href=withBase('/clearance?patient='+patientId)
 if(v.clearance)return <p className="clrLine warn">Clearance in progress: {v.progress.done} of {v.progress.needed} departments cleared{v.blockers.length?' · '+v.blockers[0]:''}. <a href={href}>Open checklist</a></p>
 const today=v.lastCleared&&new Date(v.lastCleared.at).toDateString()===new Date().toDateString()
 return today?<p className="clrLine ok">Clearance <b>{v.lastCleared.clearanceNo}</b> issued. The patient can be discharged.</p>:<p className="clrLine bad">No clearance issued today. Discharge after every department has cleared the patient. <a href={href}>Start clearance</a></p>}
