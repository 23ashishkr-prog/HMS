'use client'
/** Browser helper: all screens read/write through the real API. */
import {embedRequestHeaders} from './embedSession'
/** Same method+URL+body within a 20-second window → same Idempotency-Key, so a double click / double submit never creates twice. */
export function idemKey(method:string,url:string,body:string,now=Date.now()){let h=2166136261;for(const c of method+'|'+url+'|'+body+'|'+Math.floor(now/20000)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return 'k-'+h.toString(36)+'-'+Math.floor(now/20000).toString(36)}
export async function call<T=any>(url:string,method='GET',body?:unknown):Promise<T>{const b=body?JSON.stringify(body):undefined;const headers:Record<string,string>={...embedRequestHeaders()};if(b)headers['Content-Type']='application/json';if(method!=='GET')headers['Idempotency-Key']=idemKey(method,url,b||'');const r=await fetch(url,{method,cache:'no-store',credentials:'include',headers,body:b});const j=await r.json().catch(()=>({}));if(!r.ok){const err:any=new Error(j.error||('Request failed ('+r.status+')'));err.data=j;throw err}
 // Tell the shell what the server auto-corrected or wants re-checked (shown as a note to the user).
 const corr=[...(j.corrections||[]),...(j.patient?.corrections||[])],sug=[...(j.suggestions||[]),...(j.patient?.suggestions||[])];if((corr.length||sug.length)&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('hms:corrections',{detail:{corrections:[...new Set(corr)],suggestions:sug}}))
 return j}
export const formObj=(e:React.FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string,string>
export const inr=(n:unknown)=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
export const dt=(s?:string)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—'

/** Shared, de-duplicated "who am I" lookup: the shell and the page reuse one request (refreshed after 30 s). */
let meP:Promise<any>|null=null,meAt=0
export function me():Promise<any>{if(!meP||Date.now()-meAt>30000){meAt=Date.now();meP=fetch('/api/auth/me',{cache:'no-store',credentials:'include'}).then(async r=>{if(!r.ok){const e:any=new Error('Unauthenticated');e.status=r.status;throw e}return r.json()});meP.catch(()=>{meP=null})}return meP}
export function clearMe(){meP=null}
