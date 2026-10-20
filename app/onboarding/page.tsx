'use client'
import {useEffect,useState} from 'react';import {call,formObj} from '@/lib/client'
export default function Page(){const[plans,setPlans]=useState<any[]>([]),[months,setMonths]=useState(2),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{call('/api/onboarding').then(x=>{setPlans(x.plans);setMonths(x.trialMonths)}).catch(e=>setMsg(e.message))},[])
 return <main className="authPage"><section className="authCard" style={{maxWidth:640}}><span className="overline">START YOUR {months}-MONTH FREE TRIAL</span><h1>Register your hospital</h1><p>Creates your hospital workspace and your admin login. Your data is isolated from every other hospital.</p>
 <form className="authForm" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const x=await call('/api/onboarding','POST',formObj(e));window.location.href=x.redirect}catch(er:any){setMsg(er.message)}finally{setBusy(false)}}}>
 <label>Hospital name *<input name="hospitalName" required/></label><label>Hospital code (login + UHID prefix, 3-10 letters) <input name="code" placeholder="auto from name"/></label><label>Address<input name="address"/></label><label>GSTIN<input name="gstin"/></label><label>Phone<input name="phone"/></label>
 <label>Plan<select name="planCode">{plans.map(p=><option key={p.code} value={p.code}>{p.name} · {p.modules.length} modules · {p.max_users??'unlimited'} users</option>)}</select></label>
 <label>Your name *<input name="adminName" required/></label><label>Your email *<input name="adminEmail" type="email" required/></label><label>Password (10+ characters) *<input name="password" type="password" minLength={10} required/></label>
 <button className="primary full" disabled={busy}>{busy?'Creating…':'Create hospital workspace'}</button>{msg&&<div className="authMessage">{msg}</div>}</form><p><a href="/auth/login">Already registered? Sign in</a></p></section></main>}
