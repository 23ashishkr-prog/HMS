'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {call,formObj} from '@/lib/client'
import {toast} from '@/lib/toast'
import PaymentConfirmations from '@/components/PaymentConfirmations'

/** Hospital gateway settings and the payment list. Admin and billing only. */
export default function HospitalPayments({section}:{section?:string}){
 const confirm=section==='confirmations'
 return <div>
  <p className="chips">
   <Link className={'chip'+(confirm?'':' on')} href="/admin/settings?tab=payments">Gateway</Link>
   <Link className={'chip'+(confirm?' on':'')} href="/admin/settings?tab=payments&section=confirmations">Payments</Link>
   <Link className="chip" href="/billing">Billing desk</Link>
  </p>
  {confirm?<PaymentConfirmations/>:<GatewayForm/>}
 </div>
}

function GatewayForm(){
 const[d,setD]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
 const load=()=>call('/api/hospital/gateway').then(setD).catch((e:any)=>setErr(e.message))
 useEffect(()=>{load()},[])
 if(err&&!d)return <p className="banner err">{err}</p>
 if(!d)return <p className="muted">Loading…</p>
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
  if(!confirm('Disconnect this hospital\'s payment gateway? Patient online checkout will stop. Cash and UPI entered on the bill still work.'))return
  setBusy(true)
  try{setD(await call('/api/hospital/gateway','PUT',{clear:true}));toast('Gateway cleared')}
  catch(ex:any){toast(ex.message,'err')}
  finally{setBusy(false)}
 }
 return <div>
  <p className="muted"><small>This hospital&apos;s own gateway for patient invoices. Separate from the platform owner&apos;s plan billing. Secrets stay encrypted.</small></p>
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
     <option value="true">Enabled — Pay online on bills</option>
     <option value="false">Disabled — record cash and UPI on the bill</option>
    </select>
   </label>
   <label>Key ID
    <input name="keyId" autoComplete="off" placeholder={d.keyId||'rzp_test_…'} defaultValue=""/>
    <small className="muted">Stored: {d.keyId||'—'}. Leave blank to keep.</small>
   </label>
   <label>Key Secret
    <input name="keySecret" type="password" autoComplete="new-password" placeholder="Leave blank to keep" defaultValue=""/>
    <small className="muted">Stored: {d.keySecret||'—'}.</small>
   </label>
   <label>Webhook Secret
    <input name="webhookSecret" type="password" autoComplete="new-password" placeholder="Leave blank to keep" defaultValue=""/>
    <small className="muted">Stored: {d.webhookSecret||'—'}.</small>
   </label>
   <p className="muted"><small>Webhook URL (Razorpay Dashboard → Webhooks): <code>{d.webhookUrl}</code> · events: payment.captured, order.paid, payment.failed</small></p>
   <div className="chips">
    <button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Save gateway'}</button>
    <button type="button" className="ghost" disabled={busy} onClick={clear}>Disconnect</button>
   </div>
  </form>
 </div>
}
