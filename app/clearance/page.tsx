'use client'
import {Suspense,useEffect,useState} from 'react'
import {useSearchParams,useRouter} from 'next/navigation'
import ModuleShell from '@/components/ModuleShell'
import ClearancePanel from '@/components/ClearancePanel'
import {Tabs, ViewSwap} from '@/components/Tabs'
import {tabValue} from '@/lib/tabs'
import {call,dt,me as whoAmI} from '@/lib/client'
import {toast,toastErr} from '@/lib/toast'
import {useI18n} from '@/components/I18n'
const MY_DEPTS:Record<string,string[]>={lab:['lab','radiology'],pharmacy:['pharmacy'],doctor:['opd','ipd'],nurse:['ipd'],admin:['opd','lab','radiology','pharmacy','ipd']}
const DLABEL:Record<string,string>={opd:'OPD',lab:'Lab',radiology:'Radiology',pharmacy:'Pharmacy',ipd:'Ward',billing:'Billing'}
const TONE:Record<string,string>={signed:'ok',ready:'warn',pending:'bad',hold:'bad',reopened:'bad',not_involved:'na'}

function Slip({id}:{id:string}){const[v,setV]=useState<any>(null);useEffect(()=>{call('/api/clearance?patientId='+id).then(setV).catch(toastErr)},[id])
 if(!v)return null;if(!v.lastCleared)return <p className="emptyState">No clearance has been issued for this patient yet.</p>
 return <div className="clrSlip card"><span className="overline">CLEARANCE SLIP</span><h2>{v.patient.full_name} <small>{v.patient.uhid}</small></h2><p><b>{v.lastCleared.clearanceNo}</b> · issued {dt(v.lastCleared.at)}{v.lastCleared.by?' by '+v.lastCleared.by:''}</p><p>All departments involved in this patient&apos;s care have confirmed, and there are no dues. The patient may leave.</p><div className="actionRow noPrint"><button className="primary" onClick={()=>window.print()}>Print</button></div></div>}

const CLR_TABS=[{id:'mine',label:'Waiting for me'},{id:'all',label:'All open'}]
function Desk(){const {t}=useI18n();const sp=useSearchParams(),router=useRouter();const[role,setRole]=useState('');const view=tabValue(sp.toString(),'view',['mine','all'],'mine');const waiting=view==='mine';const[rows,setRows]=useState<any[]|null>(null),[sel,setSel]=useState<string|null>(sp.get('patient')),[q,setQ]=useState(''),[hits,setHits]=useState<any[]>([])
 const load=()=>call('/api/clearance'+(waiting?'?mine=1':'')).then(x=>setRows(x.clearances)).catch(toastErr)
 useEffect(()=>{whoAmI().then((m:any)=>{setRole(m.role);if(!sp.get('view')&&['billing','reception','admin'].includes(m.role)){const q=new URLSearchParams(sp.toString());q.set('view','all');router.replace('/clearance?'+q.toString())}}).catch(()=>{})},[])
 useEffect(()=>{setRows(null);load()},[view])
 useEffect(()=>{if(q.trim().length<2){setHits([]);return}const t=setTimeout(()=>call('/api/patients?q='+encodeURIComponent(q)).then(x=>setHits(x.patients.slice(0,6))).catch(()=>{}),200);return()=>clearTimeout(t)},[q])
 const open=(id:string)=>{setSel(id);setHits([]);setQ('');const q=new URLSearchParams(sp.toString());q.set('patient',id);router.replace('/clearance?'+q.toString())}
 if(sp.get('print')&&sel)return <Slip id={sel}/>
 const depts=MY_DEPTS[role]||[]
 async function signAll(d:string){try{const x=await call('/api/clearance','POST',{action:'sign_all_ready',department:d});toast(x.signed?`${DLABEL[d]}: ${x.signed} patient${x.signed>1?'s':''} cleared`:`${DLABEL[d]}: nobody is ready to sign`);load()}catch(e){toastErr(e)}}
 return <div className="clrDesk">
  <div className="panel modulePanel">
   <div className="actionRow"><input className="moduleInput" value={q} onChange={e=>setQ(e.target.value)} placeholder="Find a patient by name, UHID or mobile to start or check clearance" aria-label="Find patient"/></div>
   {hits.map(p=><div className="moduleRow" key={p.id}><div><b>{p.full_name}</b><small>{p.uhid}</small></div><button className="primary" onClick={()=>open(p.id)}>Open checklist</button></div>)}
   <Tabs items={CLR_TABS.map(c=>({...c,label:t(c.label)}))} value={view} param="view" extra={depts.filter(d=>rows?.some(r=>r.departments.some((x:any)=>x.key===d&&x.status==='ready'))).map(d=><button key={d} type="button" className="chip" onClick={()=>signAll(d)} title="Sign every patient whose checks are all clear">Confirm all ready · {DLABEL[d]}</button>)}/>
   <ViewSwap id={view} pending={rows===null}>{rows&&!rows.length?<p className="emptyState">{waiting?'Nobody is waiting for your sign-off.':'No open clearances.'}</p>:rows&&
   <div className="tableWrap"><table className="dataTable"><thead><tr><th>Patient</th><th>Started</th><th>Departments</th><th>Progress</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.patient.id} className={sel===r.patient.id?'sel':''}>
    <td><b>{r.patient.full_name}</b><br/><small>{r.patient.uhid}</small></td><td>{dt(r.requestedAt)}<br/><small>{r.requestedBy||''}</small></td>
    <td>{r.departments.map((d:any)=><span key={d.key} className={'clrPill '+(TONE[d.status]||'na')} title={d.status}>{DLABEL[d.key]}</span>)}</td>
    <td>{r.readyToIssue?<span className="clrPill ok">Ready to issue</span>:`${r.progress.done}/${r.progress.needed}`}</td><td><button className={r.waitingForMe.length||r.readyToIssue?'primary':''} onClick={()=>open(r.patient.id)}>Open</button></td></tr>)}</tbody></table></div>}</ViewSwap>
  </div>
  {sel&&<ClearancePanel patientId={sel} onChange={load}/>}
 </div>}

export default function Page(){return <ModuleShell title="Ready to leave" eyebrow="Today" description="See who can leave. Green means a department has signed."><Suspense><Desk/></Suspense></ModuleShell>}
