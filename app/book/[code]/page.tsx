'use client'
import {use,useEffect,useState} from 'react'
const istDay=(o=0)=>new Date(Date.now()+330*60000+o*864e5).toISOString().slice(0,10)
export default function Book({params}:{params:Promise<{code:string}>}){const {code}=use(params);const[info,setInfo]=useState<any>(null),[err,setErr]=useState(''),[f,setF]=useState<any>({name:'',mobile:'',email:'',doctorId:'',date:istDay(),at:'',mode:'in_person',reason:'',consent:true}),[slots,setSlots]=useState<any[]|null>(null),[busy,setBusy]=useState(false),[done,setDone]=useState<any>(null)
 const q=(x:any)=>fetch('/api/public/book?'+new URLSearchParams({h:code,...x})).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);return j})
 useEffect(()=>{q({}).then(setInfo).catch(e=>setErr(e.message))},[code])
 useEffect(()=>{if(!f.doctorId){setSlots(null);return}setSlots(null);q({doctorId:f.doctorId,date:f.date}).then(j=>setSlots(j.slots)).catch(e=>{setErr(e.message);setSlots([])})},[f.doctorId,f.date])
 async function go(e:any){e.preventDefault();if(!f.at){setErr('Choose a time.');return}setBusy(true);setErr('');try{const r=await fetch('/api/public/book',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({h:code,...f})});const j=await r.json();if(!r.ok)throw new Error(j.error);setDone(j)}catch(x:any){setErr(x.message);if(/taken/.test(x.message))q({doctorId:f.doctorId,date:f.date}).then(j=>setSlots(j.slots))}finally{setBusy(false)}}
 const days=[0,1,2,3,4,5,6].map(i=>istDay(i))
 return <main className="selfci bookPage"><div className="card pad"><span className="eyebrow2">BOOK AN APPOINTMENT</span><h1>{info?.hospital||'Online booking'}</h1>{info?.address&&<p className="muted">{info.address}</p>}
  {done?<div className="tokenBig"><small>Booked{done.newPatient?' · new patient':''}</small><b>{done.when}</b><p>{done.doctor} · {done.mode==='video'?'Video consultation':'In person'}</p>{done.meetUrl&&<p><a className="primary btnLink" href={done.meetUrl} target="_blank" rel="noreferrer">Video link</a></p>}{done.videoPending&&<p><small>The video link will be sent before your visit.</small></p>}<p><small>{done.notified?'Confirmation sent on WhatsApp. ':''}Manage it in the <a href={done.portal}>patient portal</a> (log in with your mobile number).</small></p></div>
  :info&&<form onSubmit={go} className="formGrid">
   <label>Patient name<input required autoComplete="name" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label>
   <label>Mobile number<input required inputMode="numeric" autoComplete="tel" value={f.mobile} onChange={e=>setF({...f,mobile:e.target.value})}/></label>
   <label>Doctor<select required value={f.doctorId} onChange={e=>setF({...f,doctorId:e.target.value,at:''})}><option value="">Choose a doctor…</option>{info.doctors.map((d:any)=><option key={d.id} value={d.id}>{d.full_name}{d.department?' · '+d.department:''}</option>)}</select></label>
   <label>Visit type<div className="chips">{[['in_person','In person'],['video','Video']].map(([k,l])=><button type="button" key={k} className={'chip'+(f.mode===k?' on':'')} onClick={()=>setF({...f,mode:k})}>{l}</button>)}</div></label>
   {f.doctorId&&<><div className="chips dayChips">{days.map(d=><button type="button" key={d} className={'chip'+(f.date===d?' on':'')} onClick={()=>setF({...f,date:d,at:''})}>{new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</button>)}</div>
    <div className="slotGrid">{slots===null?<small className="muted">Loading times…</small>:slots.length?slots.map(s=><button type="button" key={s.at} className={'chip'+(String(f.at)===String(s.at)?' on':'')} onClick={()=>setF({...f,at:s.at})}>{s.label}</button>):<small className="muted">No free times this day (doctor off or on leave). Try another day.</small>}</div></>}
   {f.mode==='video'&&<label>E-mail (optional, for the calendar invite)<input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>}
   <label>Reason (optional)<input value={f.reason} onChange={e=>setF({...f,reason:e.target.value})}/></label>
   <label className="check"><input type="checkbox" checked={f.consent} onChange={e=>setF({...f,consent:e.target.checked})}/> Send confirmation and reminders on WhatsApp</label>
   <button className="primary full" disabled={busy}>{busy?'Booking…':'Book appointment'}</button></form>}
  {err&&<p className="alert">{err}</p>}</div></main>}
