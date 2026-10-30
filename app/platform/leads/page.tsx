'use client'
import {useEffect,useState} from 'react';import Link from 'next/link';import {call,dt} from '@/lib/client'
import {HmsOnlyNote,ProductSwitch} from '@/components/PlatformProduct'
const LBL:any={new:'New',contacted:'Contacted',demo:'Demo booked',trial:'On trial',won:'Won',lost:'Lost'}
export default function Leads(){const[d,setD]=useState<any>(null),[err,setErr]=useState(''),[open,setOpen]=useState<any>(null)
 const load=()=>call('/api/platform/leads').then(setD).catch((e:any)=>setErr(e.message));useEffect(()=>{load()},[])
 const upd=async(id:string,b:any)=>{try{await call('/api/platform/leads/'+id,'PATCH',b);load()}catch(e:any){setErr(e.message)}}
 if(err&&!d)return <main className="authPage"><section className="authCard"><h1>Sales CRM</h1><p>{err}</p><Link className="primary full btnLink" href="/platform">Platform sign-in</Link></section></main>
 if(!d)return <main className="crm"><p>Loading…</p></main>
 const total=d.leads.length,won=d.counts.won||0
 return <main className="crm"><header className="crmHead"><ProductSwitch/><div><span className="overline">PLATFORM · SALES</span><h1>Leads pipeline</h1><p className="muted">{total} leads · {won} won · {total?Math.round(won*100/total):0}% conversion</p></div><Link href="/platform" className="ghost btnLink">← Platform</Link></header>
 <HmsOnlyNote/>
 <div className="kanban">{d.stages.map((st:string)=><section key={st} className={'kcol k-'+st}><h3>{LBL[st]}<span>{d.counts[st]}</span></h3>
  {d.leads.filter((l:any)=>l.status===st).map((l:any)=><article key={l.id} className="kcard" onClick={()=>setOpen(l)}><b>{l.hospital_name}</b><small>{l.name} · {l.city||'—'}{l.beds?' · '+l.beds+' beds':''}</small><small className="muted">{dt(l.created_at)}{l.next_follow_up?' · follow up '+String(l.next_follow_up).slice(0,10):''}</small>
   <select value={l.status} onClick={e=>e.stopPropagation()} onChange={e=>upd(l.id,{status:e.target.value})} aria-label="Stage">{d.stages.map((x:string)=><option key={x} value={x}>{LBL[x]}</option>)}</select></article>)}</section>)}</div>
 {open&&<div className="modalBackdrop" onClick={()=>setOpen(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="sheetHead"><h2>{open.hospital_name}</h2><button className="ghost" aria-label="Close" onClick={()=>setOpen(null)}>✕</button></div>
  <p><b>{open.name}</b> · <a href={'tel:'+open.phone}>{open.phone}</a>{open.email&&<> · <a href={'mailto:'+open.email}>{open.email}</a></>}</p><p className="muted">{open.message||'No message'}</p>
  <div className="chips"><a className="chip" href={'https://wa.me/'+open.phone.replace(/\D/g,'').replace(/^(\d{10})$/,'91$1')} target="_blank" rel="noreferrer">WhatsApp</a></div>
  <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);upd(open.id,{notes:String(f.get('notes')||''),nextFollowUp:String(f.get('fu')||'')});setOpen(null)}}><label>Notes<textarea name="notes" defaultValue={open.notes||''}/></label><label>Next follow-up<input name="fu" type="date" defaultValue={open.next_follow_up?String(open.next_follow_up).slice(0,10):''}/></label><button className="primary">Save</button></form></div></div>}</main>}
