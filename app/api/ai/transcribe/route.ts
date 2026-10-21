import {HttpError} from '@/lib/services/core';import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic'
/** Server fallback for voice typing when the browser lacks Web Speech. OpenAI-compatible /audio/transcriptions.
 *  Env: TRANSCRIBE_API_URL (defaults to LLM_API_URL), TRANSCRIBE_API_KEY (defaults to LLM_API_KEY), TRANSCRIBE_MODEL (default whisper-1). Audio is not stored. */
export const POST=api(async(c,db,r)=>{const base=String(process.env.TRANSCRIBE_API_URL||process.env.LLM_API_URL||'').replace(/\/$/,''),key=String(process.env.TRANSCRIBE_API_KEY||process.env.LLM_API_KEY||'')
 if(!base||!key)throw new HttpError(503,'Server transcription not configured; use Chrome/Edge/Android for on-device voice typing')
 const fd=await r.formData();const a=fd.get('audio');if(!(a instanceof Blob)||a.size>10_000_000)throw new HttpError(400,'audio (≤10 MB) required')
 const out=new FormData();out.append('file',a,'speech.webm');out.append('model',process.env.TRANSCRIBE_MODEL||'whisper-1');const lang=String(fd.get('lang')||'en-IN').slice(0,2);out.append('language',lang)
 const res=await fetch(base.replace(/\/chat\/completions$/,'')+'/audio/transcriptions',{method:'POST',headers:{authorization:'Bearer '+key},body:out,signal:AbortSignal.timeout(30000)})
 if(!res.ok)throw new HttpError(503,'Transcription provider error '+res.status);const j:any=await res.json();return {text:String(j.text||'').trim()}})
