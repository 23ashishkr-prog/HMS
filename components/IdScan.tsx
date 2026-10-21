'use client'
import {useRef,useState} from 'react';import {call} from '@/lib/client';import {toast,toastErr} from '@/lib/toast'
/** Scan the QR on an Aadhaar / ID card with the camera (BarcodeDetector) or a photo, and autofill registration.
 *  Photo without readable QR falls back to AI OCR when configured. Full ID numbers are never kept. */
export default function IdScan({onFields}:{onFields:(f:any)=>void}){const[open,setOpen]=useState(false),[busy,setBusy]=useState(false);const v=useRef<HTMLVideoElement>(null),st=useRef<MediaStream|null>(null),file=useRef<HTMLInputElement>(null)
 const W:any=typeof window!=='undefined'?window:{}
 async function done(payload:any){setBusy(true);try{const f=await call('/api/idscan','POST',payload);onFields(f);toast('Filled from ID'+(f.idLast4?' (ID ••••'+f.idLast4+')':'')+'. Please verify.');close()}catch(e){toastErr(e)}finally{setBusy(false)}}
 function close(){st.current?.getTracks().forEach(t=>t.stop());st.current=null;setOpen(false)}
 async function cam(){if(!W.BarcodeDetector){file.current?.click();return}setOpen(true);try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});st.current=s;if(v.current){v.current.srcObject=s;await v.current.play()}const d=new W.BarcodeDetector({formats:['qr_code']})
  const tick=async()=>{if(!st.current)return;try{const r=await d.detect(v.current);if(r[0]?.rawValue){await done({qr:r[0].rawValue});return}}catch{}requestAnimationFrame(tick)};tick()}catch(e){close();file.current?.click()}}
 async function photo(e:any){const f=e.target.files?.[0];e.target.value='';if(!f)return
  if(W.BarcodeDetector){try{const bmp=await createImageBitmap(f);const r=await new W.BarcodeDetector({formats:['qr_code']}).detect(bmp);if(r[0]?.rawValue)return done({qr:r[0].rawValue})}catch{}}
  const url:string=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result));fr.readAsDataURL(f)});done({image:url})}
 return <><button type="button" className="ghost idScanBtn" onClick={cam} disabled={busy}>🪪 Scan ID / Aadhaar QR</button><input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={photo}/>
 {open&&<div className="idScanSheet" role="dialog" aria-label="Scan ID QR"><video ref={v} playsInline muted/><div className="row"><small>Point at the QR on the card</small><button type="button" className="ghost" onClick={()=>file.current?.click()}>Use photo</button><button type="button" onClick={close}>Cancel</button></div></div>}</>}
