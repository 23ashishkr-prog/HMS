'use client'
import {useState} from 'react';import {call,formObj} from '@/lib/client'
/** Patient-facing status: stage, next step and location only (no clinical details). */
export default function Page(){const[r,setR]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
 const pre=typeof window!=='undefined'?new URLSearchParams(location.search):null
 return <main className="authPage glassBg"><section className="authCard glass" style={{maxWidth:460}}><span className="overline">MY HOSPITAL VISIT</span><h1>Where do I go next?</h1>
 <form className="authForm" onSubmit={async e=>{e.preventDefault();setBusy(true);setErr('');try{setR(await call('/api/public/status','POST',formObj(e)))}catch(x:any){setErr(x.message);setR(null)}finally{setBusy(false)}}}>
 <label>Hospital code<input name="hospitalCode" required defaultValue={pre?.get('h')||''} placeholder="e.g. SUNRISE"/></label><label>UHID or today’s token number<input name="id" required defaultValue={pre?.get('id')||''}/></label><label>Registered phone number<input name="phone" required inputMode="numeric" placeholder="10-digit mobile"/></label><button className="primary full" disabled={busy}>{busy?'Checking…':'Check status'}</button></form>
 {err&&<div className="authMessage">{err}</div>}
 {r&&<div className="nextStep big"><small>{r.hospital} · Hello {r.firstName}</small><span className="stageChip">{r.stage}</span><small>NEXT STEP</small><p>{r.nextStep}</p><small>WHERE</small><p>📍 {r.where}</p></div>}</section></main>}
