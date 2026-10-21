'use client'
import {useEffect,useRef,useState} from 'react'
/** Voice typing via the browser Web Speech API (Chrome/Edge/Android, Safari 14.1+). en-IN by default; Hindi via lang="hi-IN".
 *  Falls back to server transcription (/api/ai/transcribe, needs LLM_* Whisper-compatible env) when the browser has no speech API. */
export default function Dictate({onText,lang='en-IN',title='Dictate'}:{onText:(t:string)=>void;lang?:string;title?:string}){const[on,setOn]=useState(false),[ok,setOk]=useState(true);const rec=useRef<any>(null),mr=useRef<any>(null)
 useEffect(()=>{const W:any=window;setOk(!!(W.SpeechRecognition||W.webkitSpeechRecognition||navigator.mediaDevices?.getUserMedia))},[])
 async function start(){const W:any=window;const SR=W.SpeechRecognition||W.webkitSpeechRecognition
  if(SR){const r=new SR();r.lang=lang;r.interimResults=false;r.continuous=true;r.onresult=(e:any)=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)onText(e.results[i][0].transcript.trim())};r.onend=()=>setOn(false);r.onerror=()=>setOn(false);rec.current=r;r.start();setOn(true);return}
  try{const s=await navigator.mediaDevices.getUserMedia({audio:true});const m=new MediaRecorder(s);const parts:Blob[]=[];m.ondataavailable=e=>parts.push(e.data);m.onstop=async()=>{s.getTracks().forEach(t=>t.stop());setOn(false);const fd=new FormData();fd.append('audio',new Blob(parts,{type:m.mimeType}),'speech.webm');fd.append('lang',lang);const r=await fetch('/api/ai/transcribe',{method:'POST',body:fd});const j=await r.json().catch(()=>({}));if(j.text)onText(j.text)};mr.current=m;m.start();setOn(true)}catch{setOk(false)}}
 function stop(){rec.current?.stop();mr.current?.state==='recording'&&mr.current.stop();setOn(false)}
 if(!ok)return null
 return <button type="button" className={'dictBtn'+(on?' live':'')} onClick={on?stop:start} title={on?'Stop dictation':title} aria-label={on?'Stop dictation':title} aria-pressed={on}>{on?'■':'🎤'}</button>}
