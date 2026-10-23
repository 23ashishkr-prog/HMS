'use client'
import {useEffect,useState} from 'react';import {call,formObj} from '@/lib/client';import Logo from '@/components/Logo'
const inr=(n:any)=>'₹'+Number(n||0).toLocaleString('en-IN')
const BLURB:Record<string,string>={
 clinic:'Online appointment + token booking so patients meet the doctor with documents',
 basic:'Complete hospital operations — registration, OPD, billing, lab, pharmacy, IPD',
 ai_engage:'Basic + AI doctor assistant, WhatsApp/e-mail engagement, video Meet',
}
const FALLBACK=[
 {code:'clinic',name:'Clinic',monthly_price_inr:1999},
 {code:'basic',name:'Basic',monthly_price_inr:19999},
 {code:'ai_engage',name:'AI + Customer Engagement',monthly_price_inr:49999},
]
export default function Page(){const[plans,setPlans]=useState<any[]>([]),[days,setDays]=useState(30),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[plan,setPlan]=useState('basic'),[done,setDone]=useState<any>(null)
 useEffect(()=>{call('/api/onboarding').then(x=>{setPlans(x.plans);setDays(x.trialDays||30);setPlan(x.trialPlan||'basic')}).catch(e=>setMsg(e.message))},[])
 return <main className="authPage authPremium"><aside className="authSide" aria-hidden><div className="authSideIn"><b className="mkLogo"><Logo size={36}/> PMS Hospital Cloud</b><h2>Your hospital, live in an afternoon.</h2><ul><li>{days}-day free trial on Basic — no card needed</li><li>Indian defaults: services, departments, OPD timings</li><li>Your data isolated from every other hospital</li></ul><small>Encrypted · Role-based access · Audit trail</small></div></aside>
 <section className="authCard onbCard">{done?<div className="onbDone"><span className="overline">WORKSPACE READY</span><h1>Welcome aboard 🎉</h1><p>Your hospital is set up. Staff sign in with this hospital code:</p>
   <label>Hospital code<input readOnly value={done.code} className="codeOut" onFocus={e=>e.currentTarget.select()} aria-label="Hospital code"/></label><p className="muted">We've also e-mailed it to you (if e-mail is configured). It is also your UHID prefix.</p><a className="primary full btnLink" href={done.redirect||'/admin/setup'}>Continue to setup</a></div>:<>
  <div className="authBrand"><Logo size={36}/><div><b>PMS</b><small>HOSPITAL CLOUD</small></div></div>
  <span className="overline">START YOUR {days}-DAY FREE TRIAL (BASIC)</span><h1>Register your hospital</h1><p>Creates your workspace and admin login. Free trial is always on the <b>Basic</b> plan (full hospital ops — no AI or WhatsApp engagement). After the trial, pick Clinic, Basic or AI + Engagement.</p>
  <form className="authForm" onSubmit={async e=>{e.preventDefault();setBusy(true);setMsg('');try{const x=await call('/api/onboarding','POST',{...formObj(e),planCode:'basic'});setDone(x)}catch(er:any){setMsg(er.message)}finally{setBusy(false)}}}>
   <label>Hospital name *<input name="hospitalName" required autoComplete="organization" placeholder="e.g. Sunrise Multispeciality Hospital"/></label>
   <div className="onb2"><label>Phone<input name="phone" inputMode="tel" autoComplete="tel"/></label><label>GSTIN<input name="gstin" autoCapitalize="characters"/></label></div>
   <label>Address<input name="address" autoComplete="street-address"/></label>
   <fieldset className="planPick"><legend>Plans (trial starts on Basic)</legend>{(plans.length?plans:FALLBACK).map(p=><label key={p.code} className={'planOpt'+(plan===p.code?' on':'')+(p.code!=='basic'?' dim':'')}><input type="radio" name="plan" value={p.code} checked={plan===p.code} onChange={()=>setPlan(p.code)} disabled={p.code!=='basic'}/><span><b>{p.name}</b><small>{BLURB[p.code]||''}{p.code!=='basic'?' · available after trial':''}</small></span><em>{inr(p.monthly_price_inr)}<small>/month</small></em></label>)}</fieldset>
   <label>Your name *<input name="adminName" required autoComplete="name"/></label>
   <div className="onb2"><label>Your email *<input name="adminEmail" type="email" required autoComplete="email"/></label><label>Password (10+ characters) *<input name="password" type="password" minLength={10} required autoComplete="new-password"/></label></div>
   <button className="primary full" disabled={busy}>{busy?'Creating…':'Create hospital workspace'}</button>{msg&&<div className="authMessage" role="alert">{msg}</div>}</form>
  <div className="authNote">Already registered? <a href="/auth/login">Sign in</a> · <a href="/welcome#pricing">Compare plans</a></div></>}</section></main>}
