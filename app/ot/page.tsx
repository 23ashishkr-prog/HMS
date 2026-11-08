'use client'
import {useEffect,useState} from 'react';import {withBase} from '@/lib/basePath';import ModuleShell from '@/components/ModuleShell';import AutoMsg from '@/components/AutoMsg';import {call,formObj,inr,me as whoAmI} from '@/lib/client'
import {PHASES,WHO,Phase} from '@/lib/otChecklist'
const ST:Record<string,string>={scheduled:'Scheduled',in_progress:'In progress',completed:'Completed',cancelled:'Cancelled'}
const IST=330*60000
const istToday=()=>new Date(Date.now()+IST).toISOString().slice(0,10)
const mins=(s:string,day:string)=>(new Date(s).getTime()+IST-Date.parse(day+'T00:00:00Z'))/60000
const hhmm=(s?:string|null)=>s?new Date(new Date(s).getTime()+IST).toISOString().slice(11,16):'—'
const when=(s?:string|null)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'—'
const shift=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400e3).toISOString().slice(0,10)
const ANAES=[['general','General'],['spinal','Spinal'],['epidural','Epidural'],['regional','Regional block'],['local','Local'],['sedation','Sedation'],['none','None']]
const implantText=(xs:any[])=>(xs||[]).map(x=>[x.name,x.size,x.lot,x.qty>1?String(x.qty):''].filter(Boolean).join(' · ')).join('\n')
const parseImplants=(t:string)=>String(t||'').split('\n').map(l=>{const [name,size,lot,qty]=l.split('·').map(x=>x.trim());return {name,size,lot,qty:Number(qty)||1}}).filter(x=>x.name)

export default function Page(){const[day,setDay]=useState(istToday()),[b,setB]=useState<any>(null),[me,setMe]=useState<any>(null),[msg,setMsg]=useState(''),[form,setForm]=useState<any>(null),[sel,setSel]=useState<string|null>(null),[rooms,setRooms]=useState(false)
 const load=(d=day)=>call('/api/ot?date='+d).then(setB).catch(e=>setMsg(e.message))
 useEffect(()=>{load(day)},[day]);useEffect(()=>{whoAmI().then(setMe);const t=setInterval(()=>load(),60000);return()=>clearInterval(t)},[])
 const canBook=['admin','doctor'].includes(me?.role)
 if(!b)return <ModuleShell title="Operation theatre" eyebrow="OT" description="">{msg?<p className="err">{msg}</p>:<p>Loading…</p>}</ModuleShell>
 // Board window: 07:00–21:00, widened to fit the day's cases
 const live=b.surgeries;let lo=7*60,hi=21*60;for(const s of live){lo=Math.min(lo,Math.max(0,Math.floor(mins(s.scheduled_start,day)/60)*60));hi=Math.max(hi,Math.min(1440,Math.ceil(mins(s.scheduled_end,day)/60)*60))}
 const pct=(m:number)=>(Math.min(Math.max(m,lo),hi)-lo)/(hi-lo)*100;const hours:number[]=[];for(let h=lo;h<=hi;h+=60)hours.push(h)
 const nowM=mins(new Date().toISOString(),day)
 return <ModuleShell title="Operation theatre" eyebrow="OT" description="Each OT room's cases for the day. Open a case for the WHO checklist and the operative note."
  actions={<div className="actionRow"><button className="ghost" onClick={()=>setDay(shift(day,-1))} aria-label="Previous day">‹</button><input type="date" value={day} onChange={e=>e.target.value&&setDay(e.target.value)}/><button className="ghost" onClick={()=>setDay(shift(day,1))} aria-label="Next day">›</button>{day!==istToday()&&<button className="ghost" onClick={()=>setDay(istToday())}>Today</button>}{canBook&&<button className="primary" onClick={()=>setForm({})} disabled={!b.rooms.some((r:any)=>r.active)}>Schedule surgery</button>}</div>}>
 <div className="stats"><div className="stat"><small>Cases</small><b>{b.counts.total}</b></div><div className="stat"><small>In progress</small><b>{b.counts.inProgress}</b></div><div className="stat"><small>Completed</small><b>{b.counts.completed}</b></div><div className="stat"><small>Emergency</small><b className={b.counts.emergency?'cue-attn':''}>{b.counts.emergency}</b></div></div>
 <div className="panel modulePanel">
  {b.rooms.length===0?<p className="emptyState">No OT rooms yet.{me?.role==='admin'?' Add one below.':' Ask the admin to add OT rooms.'}</p>:
  <div className="otBoard" role="table" aria-label={'OT board '+day}>
   <div className="otRow otHead" role="row"><div className="otRoom"/><div className="otTrack">{hours.map(h=><span key={h} className="otTick" style={{left:pct(h)+'%'}}>{String(h/60).padStart(2,'0')}:00</span>)}</div></div>
   {b.rooms.map((r:any)=><div className="otRow" role="row" key={r.id}><div className="otRoom"><b>{r.name}</b>{!r.active&&<small className="muted"> off</small>}</div>
    <div className="otTrack">{hours.map(h=><span key={h} className="otLine" style={{left:pct(h)+'%'}}/>)}{nowM>=lo&&nowM<=hi&&<span className="otNow" style={{left:pct(nowM)+'%'}}/>}
     {live.filter((s:any)=>s.room_id===r.id).map((s:any)=>{const a=mins(s.scheduled_start,day),z=mins(s.scheduled_end,day);return <button key={s.id} className={'otCase '+s.status+(s.priority==='emergency'?' emergency':'')} style={{left:pct(a)+'%',width:Math.max(pct(z)-pct(a),3)+'%'}} onClick={()=>setSel(s.id)} title={`${s.procedure_name} · ${s.patient} · ${hhmm(s.scheduled_start)}–${hhmm(s.scheduled_end)} · ${ST[s.status]}`}>
      <b>{s.procedure_name}</b><small>{hhmm(s.scheduled_start)}–{hhmm(s.scheduled_end)} · {s.patient}</small><small>{s.surgeon}{s.status==='scheduled'?` · checklist ${s.checks}/3`:' · '+ST[s.status]}</small></button>})}</div></div>)}
  </div>}
  {live.length>0&&<table className="dataTable otList"><thead><tr><th>Time</th><th>Room</th><th>Patient</th><th>Procedure</th><th>Team</th><th>Status</th></tr></thead><tbody>{live.map((s:any)=><tr key={s.id} onClick={()=>setSel(s.id)} style={{cursor:'pointer'}}><td>{hhmm(s.scheduled_start)}–{hhmm(s.scheduled_end)}</td><td>{b.allRooms.find((r:any)=>r.id===s.room_id)?.name}</td><td>{s.patient}<br/><small>{s.uhid}</small></td><td>{s.procedure_name}{s.priority==='emergency'&&<span className="pill warnPill"> Emergency</span>}</td><td>{s.surgeon}{s.anaesthetist&&<><br/><small>Anaes: {s.anaesthetist}</small></>}</td><td><span className={'otPill '+s.status}>{ST[s.status]}</span></td></tr>)}</tbody></table>}
  {live.length===0&&b.rooms.length>0&&<p className="emptyState">No cases on this day.</p>}
  {me?.role==='admin'&&<p><button className="ghost" onClick={()=>setRooms(!rooms)}>{rooms?'Hide OT rooms':'Manage OT rooms'}</button></p>}
  {rooms&&<RoomAdmin all={b.allRooms} done={()=>load()} setMsg={setMsg}/>}
 </div>
 {form&&<Schedule b={b} day={day} close={()=>setForm(null)} done={(m:string)=>{setForm(null);setMsg(m);load()}} setMsg={setMsg}/>}
 {sel&&<Case id={sel} me={me} b={b} close={()=>setSel(null)} changed={()=>load()} setMsg={setMsg}/>}
 <AutoMsg msg={msg} clear={()=>setMsg('')}/></ModuleShell>}

function RoomAdmin({all,done,setMsg}:{all:any[];done:()=>void;setMsg:(m:string)=>void}){
 const add=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=formObj(e);const el=e.currentTarget;try{await call('/api/ot/rooms','POST',f);el.reset();setMsg('OT room added');done()}catch(er:any){setMsg(er.message)}}
 const toggle=async(r:any)=>{try{await call('/api/ot/rooms','POST',{id:r.id,active:!r.active});done()}catch(er:any){setMsg(er.message)}}
 return <div className="otRooms"><h3>OT rooms</h3><div className="actionRow">{all.map(r=><button key={r.id} className={'chip'+(r.active?' on':'')} onClick={()=>toggle(r)} title={r.active?'Click to switch off':'Click to switch on'}>{r.name}{r.active?'':' (off)'}</button>)}</div>
  <form className="actionRow" onSubmit={add}><input name="name" required placeholder="e.g. OT 1, Minor OT" maxLength={60}/><button>Add room</button></form></div>}

function Schedule({b,day,close,done,setMsg}:{b:any;day:string;close:()=>void;done:(m:string)=>void;setMsg:(m:string)=>void}){const[q,setQ]=useState(''),[pts,setPts]=useState<any[]>([]),[err,setErr]=useState(''),[svc,setSvc]=useState('')
 const find=()=>call('/api/patients?q='+encodeURIComponent(q)).then(x=>setPts(x.patients||[])).catch(e=>setErr(e.message))
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);const f=formObj(e) as any;f.assistantIds=fd.getAll('assistantIds');setErr('')
  try{await call('/api/ot','POST',f);done('Surgery scheduled')}catch(er:any){setErr(er.message)}}
 const s=b.services.find((x:any)=>x.id===svc)
 return <div className="modalBackdrop" onClick={close}><form className="modal wide" onClick={e=>e.stopPropagation()} onSubmit={submit}><h2>Schedule surgery</h2>
  <div className="actionRow"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();find()}}} placeholder="Find patient by name, UHID or mobile"/><button type="button" onClick={find}>Find</button></div>
  <label>Patient *<select name="patientId" required>{pts.length===0&&<option value="">Search above first</option>}{pts.map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.uhid}</option>)}</select></label>
  <div className="formGrid">
   <label>Procedure (billing)<select name="serviceId" value={svc} onChange={e=>setSvc(e.target.value)}><option value="">— not billed from OT —</option>{b.services.map((x:any)=><option key={x.id} value={x.id}>{x.name} · {inr(x.price)}</option>)}</select></label>
   <label>Procedure name {s?'':'*'}<input name="procedureName" required={!s} placeholder={s?s.name:'e.g. Open inguinal hernia repair'}/></label>
   <label>OT room *<select name="roomId" required>{b.rooms.filter((r:any)=>r.active).map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <label>Priority<select name="priority" defaultValue="elective"><option value="elective">Elective</option><option value="emergency">Emergency</option></select></label>
   <label>Date *<input name="date" type="date" required defaultValue={day}/></label>
   <label>Start *<input name="startTime" type="time" required defaultValue="09:00"/></label>
   <label>Duration (min) *<input name="durationMin" type="number" min={10} step={5} required defaultValue={60}/></label>
   <label>Anaesthesia<select name="anaesthesiaType" defaultValue=""><option value="">—</option>{ANAES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Surgeon *<select name="surgeonId" required>{b.doctors.map((d:any)=><option key={d.id} value={d.id}>{d.full_name}{d.department?' · '+d.department:''}</option>)}</select></label>
   <label>Anaesthetist<select name="anaesthetistId" defaultValue=""><option value="">—</option>{b.doctors.map((d:any)=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
  </div>
  <fieldset className="otPick"><legend>Assistants / scrub nurses</legend>{[...b.doctors,...b.nurses].map((u:any)=><label key={u.id} className="otCheck"><input type="checkbox" name="assistantIds" value={u.id}/> {u.full_name}</label>)}</fieldset>
  <label>Remarks<input name="remarks" placeholder="e.g. Blood arranged, C-arm needed"/></label>
  {err&&<div className="awayNote" role="alert">{err}</div>}
  <div className="actionRow"><button type="button" className="ghost" onClick={close}>Close</button><button className="primary">Schedule</button></div></form></div>}

function Case({id,me,b,close,changed,setMsg}:{id:string;me:any;b:any;close:()=>void;changed:()=>void;setMsg:(m:string)=>void}){const[x,setX]=useState<any>(null),[tab,setTab]=useState<string>('overview'),[err,setErr]=useState('')
 useEffect(()=>{setX(null);setErr('');call('/api/ot/'+id).then(r=>{setX(r);const s=r.surgery;setTab(s.status==='scheduled'?(s.checklist.sign_in.complete?(s.checklist.time_out.complete?'overview':'time_out'):'sign_in'):s.status==='in_progress'?'note':'overview')}).catch(e=>setErr(e.message))},[id])
 const act=async(body:any,ok:string)=>{setErr('');try{const r=await call('/api/ot/'+id,'POST',body);setX(r);setMsg(ok+(r.result?.unitPrice!=null?` · ${r.result.description} ${inr(r.result.unitPrice)} added to pending bills`:''));changed();return r}catch(er:any){setErr(er.message)}}
 if(!x)return <div className="drawer doctorDrawer" style={{width:'min(760px,100%)'}}><button className="close" onClick={close}>×</button>{err?<p className="err">{err}</p>:<p>Loading…</p>}</div>
 const s=x.surgery,doc=['admin','doctor'].includes(me?.role),team=['admin','doctor','nurse'].includes(me?.role)
 const tabs=[{id:'overview',label:'Case'},...PHASES.map(p=>({id:p.id,label:p.label+(s.checklist[p.id].complete?' ✓':'')})),{id:'note',label:'Op note'+(s.noteMissing.length?'':' ✓')}]
 return <div className="drawer doctorDrawer" role="dialog" aria-label="Surgery" style={{width:'min(760px,100%)'}}><button className="close" aria-label="Close" onClick={close}>×</button>
  <span className="overline">{s.room} · {when(s.scheduled_start)}–{hhmm(s.scheduled_end)} · <span className={'otPill '+s.status}>{ST[s.status]}</span>{s.priority==='emergency'&&<span className="pill warnPill"> Emergency</span>}</span>
  <h2>{s.procedure_name}</h2><p>{s.patient} · {s.uhid}{s.admission_no?' · '+s.admission_no:''}</p>
  <div className="tabs" role="tablist">{tabs.map(t=><button key={t.id} type="button" role="tab" aria-selected={tab===t.id} className={tab===t.id?'on':''} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
  {err&&<div className="awayNote" role="alert">{err}</div>}
  {tab==='overview'&&<div className="otOverview">
   <dl className="otDl"><dt>Surgeon</dt><dd>{s.surgeon}</dd><dt>Anaesthetist</dt><dd>{s.anaesthetist||'—'}</dd><dt>Assistants</dt><dd>{s.assistants.join(', ')||'—'}</dd><dt>Anaesthesia</dt><dd>{ANAES.find(a=>a[0]===s.anaesthesia_type)?.[1]||'—'}</dd>
    <dt>Billing</dt><dd>{s.service_name?`${s.service_name} · ${inr(s.service_price)}`:'Not billed from OT'}</dd><dt>Started</dt><dd>{when(s.actual_start)}</dd><dt>Finished</dt><dd>{when(s.actual_end)}</dd>{s.remarks&&<><dt>Remarks</dt><dd>{s.remarks}</dd></>}{s.cancel_reason&&<><dt>Cancelled</dt><dd>{s.cancel_reason}</dd></>}</dl>
   <ol className="otSteps">{PHASES.map(p=><li key={p.id} className={s.checklist[p.id].complete?'done':''}><b>{p.label}</b> · {s.checklist[p.id].complete?`${s.checklist[p.id].by}, ${when(s.checklist[p.id].at)}`:`${WHO[p.id].length-s.checklist[p.id].missing.length}/${WHO[p.id].length} answered`}</li>)}<li className={s.noteMissing.length?'':'done'}><b>Operative note</b> · {s.noteMissing.length?'needs '+s.noteMissing.join(', '):`${s.note_name||''}, ${when(s.note_at)}`}</li></ol>
   <div className="actionRow">
    {s.status==='scheduled'&&team&&<button className="primary" disabled={!s.checklist.sign_in.complete||!s.checklist.time_out.complete} title={!s.checklist.time_out.complete?'Sign in and time out first':''} onClick={()=>act({action:'start'},'Surgery started')}>Start surgery</button>}
    {s.status==='in_progress'&&doc&&<button className="primary" disabled={!s.checklist.sign_out.complete||s.noteMissing.length>0} title={s.noteMissing.length||!s.checklist.sign_out.complete?'Sign out and the operative note first':''} onClick={()=>act({action:'complete'},'Surgery completed')}>Complete surgery</button>}
    {s.status==='scheduled'&&doc&&<button className="ghost" onClick={()=>{const reason=prompt('Cancel this case? Reason');if(reason)act({action:'cancel',reason},'Case cancelled')}}>Cancel case</button>}
    <a className="chip" href={withBase('/ot/'+s.id)} target="_blank" rel="noreferrer">Print operative note</a></div>
   {s.status==='scheduled'&&doc&&<Move s={s} b={b} act={act}/>}
  </div>}
  {PHASES.some(p=>p.id===tab)&&<Checklist key={tab+s[tab+'_at']} phase={tab as Phase} s={s} can={team} act={act}/>}
  {tab==='note'&&<OpNote key={s.note_at||'n'} s={s} can={doc&&['scheduled','in_progress'].includes(s.status)} act={act}/>}
 </div>}

function Move({s,b,act}:{s:any;b:any;act:(b:any,ok:string)=>Promise<any>}){const[open,setOpen]=useState(false);if(!open)return <p><button className="ghost" onClick={()=>setOpen(true)}>Move / change room</button></p>
 const d=new Date(new Date(s.scheduled_start).getTime()+IST).toISOString();const dur=Math.round((new Date(s.scheduled_end).getTime()-new Date(s.scheduled_start).getTime())/60000)
 return <form className="formGrid" onSubmit={async e=>{e.preventDefault();if(await act({action:'update',...formObj(e)},'Case moved'))setOpen(false)}}>
  <label>Room<select name="roomId" defaultValue={s.room_id}>{b.rooms.filter((r:any)=>r.active).map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
  <label>Date<input name="date" type="date" defaultValue={d.slice(0,10)}/></label><label>Start<input name="startTime" type="time" defaultValue={d.slice(11,16)}/></label><label>Duration (min)<input name="durationMin" type="number" min={10} step={5} defaultValue={dur}/></label>
  <div className="actionRow"><button type="button" className="ghost" onClick={()=>setOpen(false)}>Close</button><button className="primary">Save</button></div></form>}

function Checklist({phase,s,can,act}:{phase:Phase;s:any;can:boolean;act:(b:any,ok:string)=>Promise<any>}){const c=s.checklist[phase],P=PHASES.find(p=>p.id===phase)!;const[a,setA]=useState<Record<string,any>>(c.answers||{})
 const locked=c.complete||!can||['completed','cancelled'].includes(s.status)||(phase==='sign_out'?s.status!=='in_progress':s.status!=='scheduled')
 const why=c.complete?`Signed by ${c.by}, ${when(c.at)}`:phase==='time_out'&&!s.checklist.sign_in.complete?'Complete sign in first.':phase==='sign_out'&&s.status==='scheduled'?'Sign out is done at the end of the surgery.':''
 const left=WHO[phase].filter(i=>i.kind==='check'?a[i.key]!==true:!(i.options||[]).some(o=>o[0]===a[i.key])).length
 return <form className="otChecklist" onSubmit={e=>{e.preventDefault();act({action:'checklist',phase,answers:a},left?'Checklist saved':P.label+' signed')}}>
  <p className="muted"><b>{P.label}</b> · {P.when}{why&&<> · {why}</>}</p>
  {WHO[phase].map(i=><div key={i.key} className={'otItem'+((i.kind==='check'?a[i.key]===true:a[i.key])?' ok':'')}>{i.kind==='check'?<label className="otCheck"><input type="checkbox" disabled={locked} checked={a[i.key]===true} onChange={e=>setA({...a,[i.key]:e.target.checked})}/> {i.text}</label>
   :<><span>{i.text}</span><span className="otOpts">{i.options!.map(([v,l])=><label key={v} className="otCheck"><input type="radio" name={i.key} disabled={locked} checked={a[i.key]===v} onChange={()=>setA({...a,[i.key]:v})}/> {l}</label>)}</span></>}</div>)}
  <label>Note<input value={a.note||''} disabled={locked} onChange={e=>setA({...a,note:e.target.value})} placeholder="e.g. allergy details, concerns raised"/></label>
  {!locked&&<div className="actionRow"><button className="primary">{left?`Save (${left} left)`:'Sign '+P.label.toLowerCase()}</button></div>}</form>}

function OpNote({s,can,act}:{s:any;can:boolean;act:(b:any,ok:string)=>Promise<any>}){
 const save=(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=formObj(e) as any;act({action:'note',...f,implants:parseImplants(f.implants)},'Operative note saved')}
 const T=(n:string,l:string,v:any,rows=3,req=false)=><label>{l}{req?' *':''}<textarea name={n} rows={rows} defaultValue={v||''} disabled={!can}/></label>
 return <form className="otNote" onSubmit={save}>{!can&&<p className="muted">{s.status==='completed'?'Locked: the surgery is completed.':'Only the surgeon or admin edits the operative note.'}</p>}
  <div className="formGrid">{T('preOpDiagnosis','Pre-op diagnosis',s.pre_op_diagnosis,2)}{T('postOpDiagnosis','Post-op diagnosis',s.post_op_diagnosis,2,true)}</div>
  {T('findings','Findings',s.findings)}{T('procedureDetails','Procedure details',s.procedure_details,6,true)}
  <label>Implants <small className="muted">· one per line: name · size · lot/serial · qty</small><textarea name="implants" rows={2} defaultValue={implantText(s.implants)} disabled={!can}/></label>
  <div className="formGrid"><label>Blood loss (ml)<input name="bloodLossMl" type="number" min={0} defaultValue={s.blood_loss_ml??''} disabled={!can}/></label>{T('complications','Complications',s.complications,1)}</div>
  {T('postOpInstructions','Post-op instructions',s.post_op_instructions,3)}
  {can&&<div className="actionRow"><button className="primary">Save operative note</button></div>}</form>}
