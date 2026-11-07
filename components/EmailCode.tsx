'use client'
import {FormEvent, useEffect, useRef, useState} from 'react'

/** Six digits on the same screen. Resend stays quiet for 30 seconds. Continues as soon as the code is complete. */
export default function EmailCode({email, busy, error, onSubmit, onResend, onChangeEmail}:{email:string; busy:boolean; error?:string; onSubmit:(code:string)=>Promise<void>; onResend:()=>Promise<number|void>; onChangeEmail?:(email:string)=>Promise<void>}){
 const[d,setD]=useState(['','','','','',''])
 const[left,setLeft]=useState(30)
 const[fix,setFix]=useState(false)
 const[next,setNext]=useState(email)
 const refs=useRef<(HTMLInputElement|null)[]>([])
 useEffect(()=>{refs.current[0]?.focus()},[])
 useEffect(()=>{if(left<=0)return;const t=setTimeout(()=>setLeft(left-1),1000);return()=>clearTimeout(t)},[left])
 async function fill(code:string){const n=[0,1,2,3,4,5].map(i=>code[i]||'');setD(n);if(code.length===6)await onSubmit(code)}
 function setAt(i:number,v:string){const ch=v.replace(/\D/g,'').slice(-1);const n=d.slice();n[i]=ch;setD(n);if(ch&&i<5)refs.current[i+1]?.focus();if(n.every(Boolean))void onSubmit(n.join(''))}
 return <div className="otpBox">
  <h1>Enter the code</h1>
  <p className="muted">Sent to <b>{email}</b>. It expires in 10 minutes.</p>
  <div className="otpRow" onPaste={e=>{const t=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);if(!t)return;e.preventDefault();void fill(t)}}>
   {d.map((v,i)=><input key={i} ref={el=>{refs.current[i]=el;}} inputMode="numeric" autoComplete={i===0?'one-time-code':'off'} maxLength={1} aria-label={`Digit ${i+1} of 6`} value={v} onChange={e=>setAt(i,e.target.value)} onKeyDown={e=>{if(e.key==='Backspace'&&!d[i]&&i>0){refs.current[i-1]?.focus();const n=d.slice();n[i-1]='';setD(n)}}}/>)}
  </div>
  <button className="primary full" type="button" disabled={busy||d.join('').length!==6} onClick={()=>onSubmit(d.join(''))}>{busy?'Checking…':'Continue'}</button>
  <button className="ghost otpResend" type="button" disabled={busy||left>0} onClick={async()=>{try{const n=await onResend();setLeft(typeof n==='number'?n:30);setD(['','','','','','']);refs.current[0]?.focus()}catch{/* the page shows the message */}}}>{left>0?`Resend code in ${left}s`:'Resend code'}</button>
  {onChangeEmail&&(fix?<form className="authForm" onSubmit={async(e:FormEvent)=>{e.preventDefault();await onChangeEmail(next);setFix(false);setLeft(30);setD(['','','','','',''])}}><label>Email<input type="email" required value={next} onChange={e=>setNext(e.target.value)} autoComplete="email"/></label><button className="primary full" type="submit" disabled={busy}>Send code to this email</button></form>:<button className="ghost otpResend" type="button" onClick={()=>{setNext(email);setFix(true)}}>Wrong email?</button>)}
  {error&&<div className="authMessage" role="alert">{error}</div>}
 </div>
}
