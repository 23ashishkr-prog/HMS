'use client'
/** Waiting-room TV. Open once, click "Start" (browsers need one tap to allow sound), then leave it full-screen. */
import {useEffect,useRef,useState} from 'react'
function chime(){try{const c=new (window.AudioContext||(window as any).webkitAudioContext)();[880,660].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=f;o.connect(g);g.connect(c.destination);const t=c.currentTime+i*0.35;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.4,t+0.03);g.gain.exponentialRampToValueAtTime(0.0001,t+0.32);o.start(t);o.stop(t+0.34)})}catch{}}
export default function Page(){const[d,setD]=useState<any>(null),[err,setErr]=useState(''),[on,setOn]=useState(false),[flash,setFlash]=useState<string>('');const last=useRef<Record<string,number|null>>({}),first=useRef(true),voice=useRef(true)
 useEffect(()=>{const q=new URLSearchParams(location.search);const url=`/api/public/display?h=${encodeURIComponent(q.get('h')||'')}&k=${encodeURIComponent(q.get('k')||'')}`;let t:any
  const tick=async()=>{try{const r=await fetch(url,{cache:'no-store'});const j=await r.json();if(!r.ok){setErr(j.error);return}setErr('');const called:string[]=[];for(const x of j.doctors){if(x.now!=null&&last.current[x.doctor]!==x.now){if(!first.current)called.push(x.doctor+'|'+x.now)}last.current[x.doctor]=x.now}first.current=false;setD(j)
   if(called.length&&on){chime();const [doc,tok]=called[0].split('|');setFlash(called[0]);setTimeout(()=>setFlash(''),8000);if(voice.current&&'speechSynthesis' in window){const u=new SpeechSynthesisUtterance(`Token number ${tok}, please go to ${doc}`);u.lang='en-IN';setTimeout(()=>speechSynthesis.speak(u),800)}}}catch{setErr('Reconnecting…')}finally{t=setTimeout(tick,5000)}}
  tick();return ()=>clearTimeout(t)},[on])
 return <main className="tv">{!on&&<button className="tvStart" onClick={()=>{setOn(true);chime();document.documentElement.requestFullscreen?.().catch(()=>{})}}>▶ Start display (enables chime)</button>}
  <header><h1>{d?.hospital||'Token display'}</h1><span>{new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'})}</span></header>
  {err&&<p className="tvErr">{err}</p>}
  <div className="tvGrid">{d?.doctors.map((x:any)=><section key={x.doctor} className={flash.startsWith(x.doctor+'|')?'flash':''}><h2>{x.doctor}</h2><div className="now"><small>Now</small><b>{x.now??'—'}</b></div><div className="next"><small>Next</small>{x.next.length?x.next.map((n:number)=><span key={n}>{n}</span>):<span>—</span>}</div><small>{x.waiting} waiting</small></section>)}{d&&!d.doctors.length&&<p className="tvEmpty">No patients in queue right now.</p>}</div>
 </main>}
