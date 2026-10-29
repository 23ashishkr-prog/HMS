'use client'
import {useEffect,useState} from 'react';import Link from 'next/link';import {call,formObj} from '@/lib/client';import Logo from '@/components/Logo';import {withBase} from '@/lib/basePath'
import {trialPlanFromParam} from '@/lib/plans'
const inr=(n:any)=>'₹'+Number(n||0).toLocaleString('en-IN')
const BLURB:Record<string,string>={
 clinic:'Online + token booking · 30-day free trial',
 basic:'Full hospital operations · 30-day free trial',
 ai_engage:'AI assistant and WhatsApp engagement · Contact Sales',
}
const FALLBACK=[
 {code:'clinic',name:'Clinic',monthly_price_inr:1999},
 {code:'basic',name:'Basic',monthly_price_inr:19999},
 {code:'ai_engage',name:'AI + Engagement',monthly_price_inr:49999},
]
export default function Page(){
 const[plans,setPlans]=useState<any[]>([]),[days,setDays]=useState(30),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[plan,setPlan]=useState('basic'),[done,setDone]=useState<any>(null),[leadOk,setLeadOk]=useState(false)
 useEffect(()=>{
  const q=new URLSearchParams(window.location.search).get('plan')
  if(q==='ai_engage')setPlan('ai_engage')
  else setPlan(trialPlanFromParam(q))
  call('/api/onboarding').then(x=>{setPlans(x.plans||[]);setDays(x.trialDays||30)}).catch(e=>setMsg(e.message))
 },[])
 const list=plans.length?plans:FALLBACK
 const sales=plan==='ai_engage'
 return (
  <main className="authPage authPremium onbPage">
   <aside className="authSide" aria-hidden>
    <div className="authSideIn">
     <Link className="mkLogo" href="/welcome"><Logo size={36}/> HMS</Link>
     <h2>Your hospital, live in an afternoon.</h2>
     <ul>
      <li>{days}-day free trial on Clinic or Basic — no card</li>
      <li>AI + Customer Engagement is Contact Sales</li>
      <li>Indian defaults: services, departments, OPD timings</li>
     </ul>
    </div>
   </aside>
   <section className="authCard onbCard">
    {done?(
     <div className="onbDone">
      <span className="overline">WORKSPACE READY</span>
      <h1>Welcome aboard</h1>
      <p>Your hospital is set up on the <b>{done.plan||plan}</b> plan. Staff sign in with this hospital code:</p>
      <label>Hospital code<input readOnly value={done.code} className="codeOut" onFocus={e=>e.currentTarget.select()} aria-label="Hospital code"/></label>
      <p className="muted">We&apos;ve also e-mailed it to you when e-mail is configured. It is also your UHID prefix.</p>
      <a className="primary full btnLink" href={withBase(done.redirect||'/admin/setup')}>Continue to setup</a>
     </div>
    ):sales?(
     <>
      <div className="authBrand"><Logo size={36}/><div><b>HMS</b><small>HOSPITAL CLOUD</small></div></div>
      <span className="overline">CONTACT SALES</span>
      <h1>AI + Customer Engagement</h1>
      <p className="onbLead">This plan has no self-serve trial. Tell us about your hospital and we will call you. Clinic and Basic still include a {days}-day trial.</p>
      {leadOk?<p className="banner ok">Thanks. We will contact you on the next working day. <Link href="/onboarding?plan=basic">Or start a Basic trial</Link>.</p>:
      <form className="authForm" onSubmit={async e=>{e.preventDefault();setBusy(true);setMsg('');try{await call('/api/public/lead','POST',{...formObj(e),source:'onboarding-ai_engage'});setLeadOk(true)}catch(er:any){setMsg(er.message)}finally{setBusy(false)}}}>
       <label>Your name *<input name="name" required autoComplete="name"/></label>
       <label>Hospital name *<input name="hospitalName" required autoComplete="organization"/></label>
       <div className="onb2"><label>Mobile *<input name="phone" required inputMode="tel" autoComplete="tel"/></label><label>Email<input name="email" type="email" autoComplete="email"/></label></div>
       <label>What do you need?<input name="message" placeholder="Beds, departments, timeline"/></label>
       <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden name="website"/>
       <button className="primary full" disabled={busy}>{busy?'Sending…':'Contact sales'}</button>
       {msg&&<div className="authMessage" role="alert">{msg}</div>}
      </form>}
      <div className="authNote"><button type="button" className="ghost" onClick={()=>setPlan('basic')}>Start a Basic trial instead</button> · <a href={withBase('/welcome#pricing')}>Pricing</a></div>
     </>
    ):(<>
     <div className="authBrand"><Link href="/welcome"><Logo size={36}/></Link><div><b>HMS</b><small>HOSPITAL CLOUD</small></div></div>
     <span className="overline">{days}-DAY FREE TRIAL</span>
     <h1>Register your hospital</h1>
     <p className="onbLead">Creates your workspace and admin login. Hospital code is generated automatically. Clinic and Basic each include a {days}-day trial on the plan you choose. AI + Customer Engagement is Contact Sales.</p>
     <form className="authForm" onSubmit={async e=>{e.preventDefault();setBusy(true);setMsg('');try{const x=await call('/api/onboarding','POST',{...formObj(e),planCode:plan});setDone(x)}catch(er:any){setMsg(er.message+(er.data?.pricingPath?' You can compare plans and buy from the pricing page.':''))}finally{setBusy(false)}}}>
      <label>Hospital name *<input name="hospitalName" required autoComplete="organization" placeholder="e.g. Sunrise Multispeciality Hospital"/></label>
      <div className="onb2"><label>Phone<input name="phone" inputMode="tel" autoComplete="tel"/></label><label>GSTIN<input name="gstin" autoCapitalize="characters"/></label></div>
      <label>Address<input name="address" autoComplete="street-address"/></label>
      <fieldset className="planPick"><legend>Choose a plan</legend>
       {list.map(p=><label key={p.code} className={'planOpt'+(plan===p.code?' on':'')}>
        <input type="radio" name="plan" value={p.code} checked={plan===p.code} onChange={()=>setPlan(p.code)}/>
        <span><b>{p.name}</b><small>{BLURB[p.code]||''}</small></span>
        <em>{inr(p.monthly_price_inr)}<small>/mo</small></em>
       </label>)}
      </fieldset>
      <label>Your name *<input name="adminName" required autoComplete="name"/></label>
      <div className="onb2"><label>Your email *<input name="adminEmail" type="email" required autoComplete="email"/></label><label>Password (10+) *<input name="password" type="password" minLength={10} required autoComplete="new-password"/></label></div>
      <button className="primary full" disabled={busy}>{busy?'Creating…':`Start ${days}-day ${plan==='clinic'?'Clinic':'Basic'} trial`}</button>
      {msg&&<div className="authMessage" role="alert">{msg} {/already used|paid plan|pricing/i.test(msg)&&<a href={withBase('/welcome#pricing')}>See pricing</a>}</div>}
     </form>
     <div className="authNote">Already registered? <Link href="/auth/login">Sign in</Link> · <a href={withBase('/welcome#pricing')}>Compare plans</a></div>
    </>)}
   </section>
  </main>
 )}
