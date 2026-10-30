'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import ModuleShell from '@/components/ModuleShell'
import AppearancePanel from '@/components/Appearance'
import {call,me} from '@/lib/client'

/** Profile holds account actions that used to live in the avatar menu: appearance, motion, hospital branding, password. */
export default function ProfilePage(){
 const[u,setU]=useState<any>(null)
 const[appear,setAppear]=useState(false)
 const[lite,setLite]=useState(false)
 const[msg,setMsg]=useState('')
 const[err,setErr]=useState('')
 const[busy,setBusy]=useState(false)
 useEffect(()=>{me().then(setU).catch(()=>{});setLite(localStorage.getItem('hms.lite')==='1')},[])
 return <ModuleShell title="Profile" eyebrow="ACCOUNT" description="Your sign-in, password and display preferences.">
  {u&&<section className="card"><h2>{u.name}</h2><p>{u.email}</p><p className="muted">{String(u.role||'').toUpperCase()} · {u.hospital?.name} · code {u.hospital?.code}</p>
   <div className="chips">
    <button type="button" className="chip" onClick={()=>setAppear(true)}>Appearance</button>
    <button type="button" className="chip" onClick={()=>{const n=!lite;setLite(n);localStorage.setItem('hms.lite',n?'1':'0');document.documentElement.classList.toggle('lite',n)}}>{lite?'Motion: reduced':'Motion: on'}</button>

    {u.role==='admin'&&<Link className="chip" href="/admin/settings">Settings</Link>}
    {(u.role==='admin'||u.role==='billing')&&<Link className="chip" href="/admin/settings?tab=payments">Payments</Link>}
    {u.role==='admin'&&<Link className="chip" href="/admin/settings?tab=users">Users & access</Link>}
   </div>
  </section>}
  <section className="card"><h2>Change password</h2>
   <form className="formGrid" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(f.get('newPassword')!==f.get('confirm')){setErr('New passwords do not match.');return}setBusy(true);setErr('');setMsg('');try{await call('/api/auth/password','POST',{currentPassword:f.get('currentPassword'),newPassword:f.get('newPassword')});setMsg('Password updated.');(e.target as HTMLFormElement).reset()}catch(ex:any){setErr(ex.message)}finally{setBusy(false)}}}>
    <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required/></label>
    <label>New password<input name="newPassword" type="password" minLength={10} autoComplete="new-password" required/></label>
    <label>Confirm<input name="confirm" type="password" minLength={10} autoComplete="new-password" required/></label>
    {err&&<p className="err">{err}</p>}{msg&&<p className="ok">{msg}</p>}
    <button className="primary" disabled={busy}>{busy?'Saving…':'Save password'}</button>
   </form>
  </section>
  {appear&&<AppearancePanel isAdmin={u?.role==='admin'} onClose={()=>setAppear(false)}/>}
 </ModuleShell>
}
