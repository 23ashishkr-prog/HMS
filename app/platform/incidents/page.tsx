'use client'
import {useEffect,useState} from 'react'
import {call,dt} from '@/lib/client'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

export default function IncidentsPage(){
 const[d,setD]=useState<any>(null)
 const[err,setErr]=useState('')
 const[msg,setMsg]=useState('')
 const load=()=>call('/api/platform/incidents').then(setD).catch((e:any)=>setErr(e.message))
 useEffect(()=>{load()},[])

 if(err&&!d)return <PlatformSignIn title="Incidents"/>
 if(!d)return <main className="plat"><p>Loading…</p></main>

 const setStatus=async(id:string,status:string)=>{
  setMsg('')
  try{await call('/api/platform/incidents','PATCH',{id,status});load()}
  catch(e:any){setMsg(e.message)}
 }

 const rows=d.incidents||[]
 const cfg=d.configured||{}

 return (
  <PlatformShell
   title="Incidents"
   eyebrow="SAAS OWNER · OPS"
   description={<>Server errors &amp; alerts · GitHub issues {cfg.github?'on':'off'} · Email {cfg.email?'on':'off'}</>}
  >
   {msg&&<p className="err">{msg}</p>}
   <div className="platTableWrap platDesktopOnly">
    <table className="dataTable">
     <thead><tr><th>Status</th><th>Source</th><th>Message</th><th>Route</th><th>Hospital</th><th>Count</th><th>Last seen</th><th></th></tr></thead>
     <tbody>
      {rows.length===0&&<tr><td colSpan={8}>No incidents.</td></tr>}
      {rows.map((i:any)=>(
       <tr key={i.id}>
        <td><span className={'pill pill-'+i.status}>{i.status}</span></td>
        <td>{i.source}</td>
        <td className="platMsgCell">{i.message}</td>
        <td><code>{i.route||'—'}</code></td>
        <td>{i.hospital_code||'—'}</td>
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
    {rows.length===0&&<p className="muted">No incidents.</p>}
    {rows.map((i:any)=>(
     <article key={i.id} className="platHospCard">
      <div className="platHospCardTop">
       <div>
        <span className={'pill pill-'+i.status}>{i.status}</span> · {i.source} · ×{i.count}
        <p className="platMsgCell">{i.message}</p>
        <small className="muted"><code>{i.route||'—'}</code> · {i.hospital_code||'—'} · {dt(i.last_seen)}</small>
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
