import {HttpError} from '@/lib/services/core';import {api,body} from '@/lib/api';import {parseIdQr,parseIdText} from '@/lib/services/idscan';import {chat,llmConfigured} from '@/lib/ai/llm';export const runtime='nodejs';export const dynamic='force-dynamic'
/** POST {qr} or {text} or {image:dataURL}. Nothing is stored; full ID numbers are never returned. */
export const POST=api(async(c,db,r)=>{const b=await body(r)
 if(b.qr)return parseIdQr(String(b.qr))
 if(b.text)return parseIdText(String(b.text))
 if(b.image){if(!llmConfigured())throw new HttpError(503,'Photo OCR needs AI configured (LLM_* env). Scan the QR on the card instead.')
  const img=String(b.image);if(!/^data:image\/(png|jpe?g|webp);base64,/.test(img)||img.length>6_000_000)throw new HttpError(400,'Send a JPEG/PNG under 4 MB')
  const res=await chat([{role:'user',content:([{type:'text',text:'Transcribe all printed text on this Indian ID card exactly, line by line. Output only the text.'},{type:'image_url',image_url:{url:img}}] as any)}],{maxTokens:600})
  return parseIdText(res.text)}
 throw new HttpError(400,'qr, text or image required')},{module:'patients'})
