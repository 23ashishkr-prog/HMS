'use client'
import {FormEvent, useState} from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import EmailCode from '@/components/EmailCode'
import {safeAppPath} from '@/lib/safeRedirect'
import {withBase} from '@/lib/basePath'

export default function LoginPage(){
 const[email,setEmail]=useState('')
 const[password,setPassword]=useState('')
 const[hosp,setHosp]=useState('')
 const[needCode,setNeedCode]=useState(false)
 const[otp,setOtp]=useState(false)
 const[message,setMessage]=useState('')
 const[busy,setBusy]=useState(false)
 async function post(extra:Record<string,string>){
  const r=await fetch(withBase('/api/auth/login'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,hospitalCode:hosp||undefined,...extra})})
  const data=await r.json()
  if(!r.ok){if(data.needHospitalCode)setNeedCode(true);throw new Error(data.error||'Login failed')}
  if(data.needsEmailVerification){setOtp(true);return data}
  window.location.assign(withBase(safeAppPath(data.redirect)))
  return data
 }
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');try{await post({})}catch(err){setMessage(err instanceof Error?err.message:'Login failed')}finally{setBusy(false)}}
 async function confirm(code:string){setBusy(true);setMessage('');try{await post({code})}catch(err){setMessage(err instanceof Error?err.message:'Login failed')}finally{setBusy(false)}}
 async function resend(){setMessage('');try{const r=await fetch(withBase('/api/auth/email-code'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,hospitalCode:hosp||undefined})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not resend');if(data.skipped){setOtp(false);await post({});return 30}return Number(data.resendIn||30)}catch(err){setMessage(err instanceof Error?err.message:'Could not resend');throw err}}
 async function changeEmail(next:string){setBusy(true);setMessage('');try{const r=await fetch(withBase('/api/auth/email-code'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,hospitalCode:hosp||undefined,nextEmail:next})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not update email');if(data.email)setEmail(data.email);if(data.skipped){setOtp(false);await post({})}}catch(err){setMessage(err instanceof Error?err.message:'Could not update email')}finally{setBusy(false)}}
 return <main className="authPage authPremium">
  <aside className="authSide" aria-hidden><div className="authSideIn"><Link className="mkLogo" href="/welcome"><Logo size={36}/> HMS</Link><h2>Every patient, every bed, every rupee — in one place.</h2><ul><li>Voice notes & e-prescriptions</li><li>WhatsApp reminders & reports</li><li>GST billing, lab & pharmacy</li></ul></div></aside>
  <section className="authCard">
   <div className="authBrand"><Logo size={36}/><div><b>HMS</b><small>HOSPITAL CLOUD</small></div></div>
   {otp?<EmailCode email={email} busy={busy} error={message} onSubmit={confirm} onResend={resend} onChangeEmail={changeEmail}/>:<>
    <span className="overline">SECURE STAFF ACCESS</span>
    <h1>Welcome back</h1>
    <p>Sign in with your hospital profile. Your role controls the information and actions available to you.</p>
    <form onSubmit={submit} className="authForm">
     <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@hospital.com" autoComplete="username"/></label>
     <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"/></label>
     <Link className="forgotLink" href="/auth/forgot">Forgot password?</Link>
     {needCode&&<label>Hospital code<input required value={hosp} onChange={e=>setHosp(e.target.value)} placeholder="e.g. SUNRISE"/></label>}
     <button className="primary full" disabled={busy} aria-busy={busy}>{busy?<><span className="spin" aria-hidden="true"/> Signing in…</>:'Sign in'}</button>
     {message&&<div className="authMessage" role="alert">{message}</div>}
    </form>
    <div className="authNote">New hospital? <Link href="/welcome">See plans</Link> or <Link href="/onboarding?plan=basic">start a 30-day trial</Link> · Patient? <Link href="/status">Check my visit status</Link></div>
   </>}
  </section>
 </main>
}
