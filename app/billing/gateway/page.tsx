'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import ModuleShell from '@/components/ModuleShell'
import {call,formObj} from '@/lib/client'
import {toast} from '@/lib/toast'

export default function HospitalGatewaySettings(){
 const[d,setD]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
 const load=()=>call('/api/hospital/gateway').then(setD).catch((e:any)=>setErr(e.message))
 useEffect(()=>{load()},[])
 if(err&&!d)return <ModuleShell title="Payment gateway" eyebrow="BILLING · GATEWAY"><p className="banner err">{err}</p><p className="muted">Admin and billing (accounts) only. Doctors and other roles cannot open this page.</p></ModuleShell>
 if(!d)return <ModuleShell title="Payment gateway" eyebrow="BILLING · GATEWAY"><p className="muted">Loading…</p></ModuleShell>

 const save=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true)
  try{
   const b=formObj(e)
   setD(await call('/api/hospital/gateway','PUT',{
    provider:b.provider||'razorpay',mode:b.mode,enabled:b.enabled==='true',
    keyId:b.keyId,keySecret:b.keySecret,webhookSecret:b.webhookSecret,
   }))
   toast('Gateway saved')
  }catch(ex:any){toast(ex.message,'err')}
  finally{setBusy(false)}
 }
 const clear=async()=>{
  if(!confirm('Disconnect this hospital\'s payment gateway? Patient online checkout will stop. Cash/UPI manual still works.'))return
  setBusy(true)
  try{setD(await call('/api/hospital/gateway','PUT',{clear:true}));toast('Gateway cleared')}
  catch(ex:any){toast(ex.message,'err')}
  finally{setBusy(false)}
 }

 return <ModuleShell title="Payment gateway" eyebrow="BILLING · GATEWAY" description="This hospital's own Razorpay keys for patient invoice payments. Separate from the SaaS platform subscription gateway. Secrets encrypted at rest.">
  <p><Link className="chip" href="/billing/gateway-payments">Payment confirmations →</Link> <Link className="chip" href="/billing">← Billing</Link></p>
  <div className="platStats" style={{marginBottom:16}}>
   <div className="platStat"><b>{d.active?'On':'Off'}</b><small>Collecting online</small></div>
   <div className="platStat"><b>{d.provider}</b><small>Provider</small></div>
   <div className="platStat"><b>{d.mode}</b><small>Mode</small></div>
   <div className="platStat"><b>{d.configured?'Yes':'No'}</b><small>Keys saved</small></div>
  </div>
  <form className="panel modulePanel platForm" onSubmit={save}>
   <label>Provider
    <select name="provider" defaultValue={d.provider||'razorpay'}>
     <option value="razorpay">Razorpay</option>
     <option value="payu" disabled>PayU (soon)</option>
     <option value="cashfree" disabled>Cashfree (soon)</option>
    </select>
   </label>
   <label>Mode
    <select name="mode" defaultValue={d.mode||'test'}>
     <option value="test">Test</option>
     <option value="live">Live</option>
    </select>
   </label>
   <label>Enabled
    <select name="enabled" defaultValue={d.enabled?'true':'false'}>
     <option value="true">Enabled — show Razorpay on invoices</option>
     <option value="false">Disabled — cash/UPI manual only</option>
    </select>
   </label>
   <label>Key ID
    <input name="keyId" autoComplete="off" placeholder={d.keyId||'rzp_test_…'} defaultValue=""/>
    <small className="muted">Stored: {d.keyId||'—'}. Leave blank to keep.</small>
   </label>
   <label>Key Secret
    <input name="keySecret" type="password" autoComplete="new-password" placeholder={d.keySecret||'••••'} defaultValue=""/>
    <small className="muted">Stored: {d.keySecret||'—'}. Leave blank to keep.</small>
   </label>
   <label>Webhook Secret
    <input name="webhookSecret" type="password" autoComplete="new-password" placeholder={d.webhookSecret||'••••'} defaultValue=""/>
    <small className="muted">Stored: {d.webhookSecret||'—'}. Leave blank to keep.</small>
   </label>
   <p className="muted"><small>Webhook URL (Razorpay Dashboard → Webhooks, per hospital): <code>{d.webhookUrl}</code> · events: payment.captured, order.paid, payment.failed</small></p>
   <p className="muted"><small>{d.accountRoleNote}</small></p>
   <div className="chips">
    <button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Save gateway'}</button>
    <button type="button" className="ghost" disabled={busy} onClick={clear}>Disconnect</button>
   </div>
  </form>
  <p className="muted"><small>Encryption: {d.encryption}. Platform SaaS plan keys are never used here.</small></p>
 </ModuleShell>
}
