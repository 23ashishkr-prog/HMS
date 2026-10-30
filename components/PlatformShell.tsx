'use client'
import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {ReactNode,useState} from 'react'
import {call} from '@/lib/client'
import {ProductSwitch,usePlatformProduct} from '@/components/PlatformProduct'

const TABS:[string,string,((p:string)=>boolean)?][]=[
 ['/platform','Overview',p=>p==='/platform'],
 ['/platform/hospitals','Hospitals',p=>p.startsWith('/platform/hospitals')],
 ['/platform/payments','Payments',p=>p.startsWith('/platform/payments')],
 ['/platform/settings','Gateway',p=>p.startsWith('/platform/settings')],
 ['/platform/incidents','Incidents',p=>p.startsWith('/platform/incidents')],
]

export function PlatformSignIn({title='Platform sign-in',hint}:{title?:string;hint?:string}){
 const[msg,setMsg]=useState('')
 const router=useRouter()
 return (
  <main className="authPage">
   <section className="authCard">
    <span className="overline">SAAS OWNER · PLATFORM</span>
    <h1>{title}</h1>
    <p className="muted">{hint||'For the product owner only. Hospital admins and staff use the normal hospital login — this console is separate and cannot be opened with a hospital account.'}</p>
    <form className="authForm" onSubmit={async e=>{
     e.preventDefault();setMsg('')
     const fd=new FormData(e.currentTarget)
     try{
      await call('/api/platform/login','POST',{email:String(fd.get('email')||''),password:String(fd.get('password')||'')})
      router.refresh();location.reload()
     }catch(er:any){setMsg(er.message)}
    }}>
     <label>Platform admin email<input name="email" type="email" required autoComplete="username"/></label>
     <label>Password<input name="password" type="password" required autoComplete="current-password"/></label>
     <button className="primary full">Sign in</button>
     {msg&&<div className="authMessage" role="alert">{msg}</div>}
    </form>
   </section>
  </main>
 )
}

export default function PlatformShell({title,eyebrow,description,children,actions}:{
 title:string;eyebrow?:string;description?:ReactNode;children:ReactNode;actions?:ReactNode
}){
 const path=usePathname()||'/platform'
 const router=useRouter()
 const {product}=usePlatformProduct()
 const[busy,setBusy]=useState(false)
 const signOut=async()=>{
  setBusy(true)
  try{await call('/api/platform/logout','POST',{});router.replace('/platform');location.reload()}
  catch{setBusy(false)}
 }
 return (
  <div className="plat">
   <header className="platTop">
    <ProductSwitch/>
    <div className="platTopBrand">
     <span className="overline">SAAS OWNER</span>
     <b>{product==='taildesk'?'TailDesk':'HMS'} platform</b>
    </div>
    <nav className="platTabs" aria-label="Platform sections">
     {TABS.map(([href,label,match])=>{
      const on=(match||(p=>p===href||p.startsWith(href+'/')))(path)
      const text=product==='taildesk'&&href==='/platform/hospitals'?'Tenants':product==='taildesk'&&href==='/platform/payments'?'Revenue':label
      return <Link key={href} href={href} className={on?'platTab on':'platTab'}>{text}</Link>
     })}
    </nav>
    <div className="platTopActions">
     <Link className="platTab ghostish" href="/platform/leads">Leads</Link>
     <button type="button" className="platSignOut" disabled={busy} onClick={signOut}>{busy?'…':'Sign out'}</button>
    </div>
   </header>
   <div className="platBody">
    <div className="platHead">
     <div>
      {eyebrow&&<span className="overline">{eyebrow}</span>}
      <h1>{title}</h1>
      {description&&<p className="muted">{description}</p>}
     </div>
     {actions&&<div className="platHeadActions">{actions}</div>}
    </div>
    {children}
   </div>
  </div>
 )
}
