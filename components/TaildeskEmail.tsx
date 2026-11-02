'use client'
import {useEffect,useState} from 'react'
import {call,formObj} from '@/lib/client'
import {usePlatformProduct} from './PlatformProduct'

/** Platform → Settings, TailDesk selected: the mailbox TailDesk uses for sign-up codes and reminders. */
export default function TaildeskEmail(){
 const {product}=usePlatformProduct()
 const[d,setD]=useState<any>(null)
 const[msg,setMsg]=useState('')
 const[err,setErr]=useState('')
 const[busy,setBusy]=useState(false)
 useEffect(()=>{if(product==='taildesk')call('/api/platform/email').then(setD).catch((e:any)=>setErr(e.message))},[product])
 if(product!=='taildesk')return null
 if(!d)return <p className="muted">{err||'Loading e-mail settings…'}</p>
 const save=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMsg('');setErr('')
  const f=formObj(e)
  try{setD(await call('/api/platform/email','PUT',f));setMsg('Saved. TailDesk will send sign-up codes and reminders from '+(f.fromEmail||'this address')+'. Send a test to be sure.')}
  catch(ex:any){setErr(ex.message)}finally{setBusy(false)}
 }
 const test=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMsg('');setErr('')
  try{const to=String(formObj(e).to||'');await call('/api/platform/email','POST',{to});setMsg('Test e-mail sent to '+to+'. Check the inbox and spam.')}
  catch(ex:any){setErr(ex.message)}finally{setBusy(false)}
 }
 return (
  <>
   <h2>TailDesk e-mail</h2>
   <p className="muted">TailDesk sends pet-owner sign-up codes and reminders from this mailbox. Use the outgoing (SMTP) details from your e-mail provider. The password is stored encrypted and shown masked.</p>
   {msg&&<p className="ok">{msg}</p>}
   {err&&<p className="err">{err}</p>}
   <form className="platForm panel modulePanel" onSubmit={save} autoComplete="off">
    <label>Sender e-mail<input name="fromEmail" type="email" required defaultValue={d.fromEmail} placeholder="info@greynova.in"/></label>
    <label>Sender name<input name="fromName" defaultValue={d.fromName||'TailDesk'}/></label>
    <label>SMTP host<input name="host" required defaultValue={d.host} placeholder="smtp.yourprovider.com"/></label>
    <label>Port<input name="port" type="number" defaultValue={d.port||587}/><small className="muted">587 (STARTTLS) or 465 (SSL).</small></label>
    <label>Login<input name="username" defaultValue={d.username} placeholder="info@greynova.in"/><small className="muted">Usually the full e-mail address.</small></label>
    <label>Password<input name="password" type="password" autoComplete="new-password" placeholder={d.password||'••••'}/><small className="muted">{d.password?'Saved. Leave blank to keep.':'Mailbox or app password.'}</small></label>
    <div className="chips"><button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Save e-mail settings'}</button></div>
   </form>
   <form className="platForm panel modulePanel" onSubmit={test}>
    <label>Send a test to<input name="to" type="email" required placeholder="you@example.com"/></label>
    <div className="chips"><button disabled={busy||!d.configured} type="submit">Send test e-mail</button></div>
   </form>
  </>
 )
}
