'use client'
import {useEffect,useState} from 'react'
import {call,dt} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

export default function IncidentsPage(){
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 const[msg,setMsg]=useState('')
 const[kind,setKind]=useState<'all'|'errors'|'tickets'>('all')
 const load=(k=kind)=>call('/api/platform/incidents?kind='+k).then(setD).catch((e:any)=>setErr(e.message))
 useEffect(()=>{load(kind)},[kind])

 if(err&&!d)return <PlatformSignIn title="Incidents"/>
 if(!d)return <main className="plat"><p>Loading…</p></main>

 const setStatus=async(id:string,status:string)=>{
  setMsg('')
  try{await call('/api/platform/incidents','PATCH',{id,status});load()}
  catch(e:any){setMsg(e.message)}
 }

 const rows=d.incidents||[]
 const cfg=d.configured||{}
 const src=d.sources||{}

 return (
  <PlatformShell
   title="Incidents & tickets"
   eyebrow="SAAS OWNER · OPS"
   description={<>Auto errors + hospital admin tickets · GitHub {cfg.github?'on':'off'} · Email {cfg.email?'on':'off'}</>}
  >
   <div className="platNote">
    <b>Where this data comes from.</b>{' '}
    <span><b>Errors</b> — {src.errors||'Automatic capture of app errors (server/client), not user-filed tickets.'}</span>
    {' '}<span><b>Tickets</b> — {src.tickets||'Hospital admins raise these from Settings → Support.'}</span>
   </div>
   {msg&&<p className="err">{msg}</p>}
   <div className="platTabsInline" role="tablist">
    {([['all','All'],['errors','Auto errors'],['tickets','Admin tickets']] as const).map(([k,label])=>(
     <button key={k} type="button" role="tab" aria-selected={kind===k} className={kind===k?'on':''} onClick={()=>setKind(k)}>{label}</button>
    ))}
   </div>
   <div className="platTableWrap platDesktopOnly">
    <table className="dataTable">
     <thead><tr><th>Status</th><th>Source</th><th>Title / message</th><th>Hospital</th><th>Count</th><th>Last seen</th><th></th></tr></thead>
     <tbody>
      {rows.length===0&&<tr><td colSpan={7}>No items.</td></tr>}
      {rows.map((i:any)=>(
       <tr key={i.id}>
        <td><span className={'pill pill-'+i.status}>{i.status}</span>{i.severity&&<> · <small>{i.severity}</small></>}</td>
        <td>{i.source==='admin_ticket'?'ticket':i.source}{i.category?` · ${i.category}`:''}</td>
        <td className="platMsgCell">{i.title&&<b>{i.title}<br/></b>}{i.message}</td>
        <td>{i.hospital_code||'—'}{i.created_by_name&&<><br/><small>{i.created_by_name}</small></>}</td>
        <td>{i.count}</td>
        <td>{dt(i.last_seen)}</td>
        <td className="platRowActions">
         {i.status==='open'&&<button type="button" className="chip" onClick={()=>setStatus(i.id,'acknowledged')}>Ack</button>}
         {i.status!=='resolved'&&i.status!=='ignored'&&<button type="button" className="chip" onClick={()=>setStatus(i.id,'resolved')}>Resolve</button>}
         {i.github_issue_url&&<a className="chip" href={i.github_issue_url} target="_blank" rel="noreferrer">Issue</a>}
        </td>
       </tr>
      ))}
     </tbody>
    </table>
   </div>
   <div className="platCardList platMobileOnly">
    {rows.length===0&&<p className="muted">No items.</p>}
    {rows.map((i:any)=>(
     <article key={i.id} className="platHospCard">
      <div className="platHospCardTop">
       <div>
        <span className={'pill pill-'+i.status}>{i.status}</span> · {i.source==='admin_ticket'?'ticket':i.source} · ×{i.count}
        {i.title&&<p><b>{i.title}</b></p>}
        <p className="platMsgCell">{i.message}</p>
        <small className="muted">{i.hospital_code||'—'}{i.created_by_name?` · ${i.created_by_name}`:''} · {dt(i.last_seen)}</small>
       </div>
      </div>
      <div className="chips">
       {i.status==='open'&&<button type="button" className="chip" onClick={()=>setStatus(i.id,'acknowledged')}>Ack</button>}
       {i.status!=='resolved'&&i.status!=='ignored'&&<button type="button" className="chip" onClick={()=>setStatus(i.id,'resolved')}>Resolve</button>}
       {i.github_issue_url&&<a className="chip" href={i.github_issue_url} target="_blank" rel="noreferrer">Issue</a>}
      </div>
     </article>
    ))}
   </div>
  </PlatformShell>
 )
}
