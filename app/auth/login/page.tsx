'use client'
import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage(){
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false)
 async function submit(event:FormEvent){event.preventDefault(); setBusy(true); setMessage('')
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){setMessage('Supabase is not configured in this preview. Connect Supabase to enable login.'); setBusy(false); return}
  const {error}=await createClient().auth.signInWithPassword({email,password}); setBusy(false); setMessage(error ? 'Invalid email or password.' : 'Signed in successfully. Redirecting...'); if(!error) window.location.href='/'
 }
 return <main className="authPage"><section className="authCard"><div className="authBrand"><span className="mark">+</span><div><b>AEGIS</b><small>HOSPITAL</small></div></div><span className="overline">HOSPITAL OPERATIONS</span><h1>Welcome back</h1><p>Sign in to continue managing patient flow.</p><form onSubmit={submit} className="authForm"><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@hospital.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label><button className="primary full" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{message&&<div className="authMessage" role="alert">{message}</div>}</form><p className="authNote">Need an account? <Link href="/auth/sign-up">Create one</Link></p></section></main>
}
