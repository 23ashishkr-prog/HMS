'use client'
import {useEffect,useState} from 'react'
import {call,formObj} from '@/lib/client'
import {withBase} from '@/lib/basePath'
import PlatformShell,{PlatformSignIn} from '@/components/PlatformShell'

export default function GatewaySettings(){
 const[d,setD]=useState<any>(null)
 const[msg,setMsg]=useState('')
 const[err,setErr]=useState('')
 const[busy,setBusy]=useState(false)
 const load=()=>call('/api/platform/settings').then(setD).catch((e:any)=>setErr(e.message))
 useEffect(()=>{load()},[])

 if(err&&!d)return <PlatformSignIn title="Gateway settings"/>
 if(!d)return <main className="plat"><p>Loading…</p></main>

 const save=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMsg('');setErr('')
  try{
   const b=formObj(e)
   const next=await call('/api/platform/settings','PUT',{
    mode:b.mode,keyId:b.keyId,keySecret:b.keySecret,webhookSecret:b.webhookSecret,
   })
   setD(next);setMsg('Saved. Hospital plan checkout will use these keys'+(next.source==='platform'?' (platform-stored)':'')+'.')
  }catch(ex:any){setErr(ex.message)}
  finally{setBusy(false)}
 }
 const clear=async()=>{
  if(!window.confirm('Clear platform-stored Razorpay keys? Env vars (if set) remain as fallback.'))return
  setBusy(true);setMsg('');setErr('')
  try{setD(await call('/api/platform/settings','PUT',{clear:true}));setMsg('Platform keys cleared. Falling back to env if configured.')}
  catch(ex:any){setErr(ex.message)}
  finally{setBusy(false)}
 }

 return (
  <PlatformShell
   title="Payment gateway"
   eyebrow="SAAS OWNER · GATEWAY"
   description={<>Razorpay keys for <b>hospital plan subscriptions only</b> (Clinic / Basic / AI+). Patient bills stay cash/UPI/card inside each hospital — never through this gateway. Secrets encrypted at rest ({d.encryption}), shown masked.</>}
  >
   <div className="platStats">
    <div className="platStat"><b>{d.configured?'Yes':'No'}</b><small>Configured</small></div>
    <div className="platStat"><b>{d.source}</b><small>Active source</small></div>
    <div className="platStat"><b>{d.mode}</b><small>Mode</small></div>
   </div>

   {msg&&<p className="ok">{msg}</p>}
   {err&&<p className="err">{err}</p>}

   <form className="platForm panel modulePanel" onSubmit={save}>
    <label>Mode
     <select name="mode" defaultValue={d.mode}>
      <option value="test">Test (rzp_test_…)</option>
      <option value="live">Live (rzp_live_…)</option>
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
    <p className="muted"><small>Webhook URL (Razorpay Dashboard → Webhooks): <code>{typeof location!=='undefined'?location.origin:''}{withBase(d.webhookPath||'/api/subscription/razorpay/webhook')}</code> · events: <code>payment.captured</code>, <code>order.paid</code>, <code>payment.failed</code></small></p>
    <div className="chips">
     <button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Save gateway keys'}</button>
     <button type="button" className="ghost" disabled={busy||!d.hasPlatformRow} onClick={clear}>Clear platform keys</button>
    </div>
   </form>
   <p className="muted"><small>Platform-stored keys take priority over Vercel env <code>RAZORPAY_*</code>. Hospital staff never see these values.</small></p>
  </PlatformShell>
 )
}
