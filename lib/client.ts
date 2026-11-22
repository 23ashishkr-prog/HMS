'use client'
/** Browser helper: all screens read/write through the real API. */
import {withBase} from './basePath'
/** Same method+URL+body within a 20-second window → same Idempotency-Key, so a double click / double submit never creates twice. */
export function idemKey(method:string,url:string,body:string,now=Date.now()){let h=2166136261;for(const c of method+'|'+url+'|'+body+'|'+Math.floor(now/20000)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return 'k-'+h.toString(36)+'-'+Math.floor(now/20000).toString(36)}
/* ── Offline mode ──────────────────────────────────────────────────────────────────────────────────────────────
 * The desks keep the last copy of the data they need (queue, catalogue, formulary, invoices, patients) on this
 * device so they open with no internet; it is cleared on sign-out. "Work offline" forces this even when online. */
const OFF_GET=[/^\/api\/(queue|frontdesk|catalog|formulary)$/,/^\/api\/invoices(\?.*)?$/,/^\/api\/invoices\/[\w-]+$/,/^\/api\/billing\/pending\?patientId=[\w-]+$/,/^\/api\/patients(\?q=.*|\/[\w-]+)$/,/^\/api\/encounters\/[\w-]+$/]
const CACHE='hms.off.',FORCE='hms-force-offline'
export const forcedOffline=()=>{try{return localStorage.getItem(FORCE)==='1'}catch{return false}}
export function setForcedOffline(v:boolean){try{if(v)localStorage.setItem(FORCE,'1');else localStorage.removeItem(FORCE)}catch{}if(typeof window!=='undefined')window.dispatchEvent(new Event('hms:net'))}
const cacheGet=(k:string)=>{try{const v=localStorage.getItem(CACHE+k);return v==null?undefined:JSON.parse(v)}catch{return undefined}}
const cachePut=(k:string,v:unknown)=>{try{localStorage.setItem(CACHE+k,JSON.stringify(v))}catch{}}
export function clearOfflineCache(){try{for(const k of Object.keys(localStorage))if(k.startsWith(CACHE))localStorage.removeItem(k)}catch{}}
const netErr=()=>Object.assign(new TypeError('Failed to fetch'),{offline:true})
const netDown=()=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('hms:net',{detail:{down:true}}))}
/** Read the copy of a GET kept for offline use (undefined when there is none). */
export const offlineCopy=(url:string)=>cacheGet(url)
export async function call<T=any>(url:string,method='GET',body?:unknown,opts:{key?:string}={}):Promise<T>{const b=body?JSON.stringify(body):undefined;const headers:Record<string,string>={};if(b)headers['Content-Type']='application/json';if(method!=='GET')headers['Idempotency-Key']=opts.key||idemKey(method,url,b||'')
 const keep=method==='GET'&&OFF_GET.some(re=>re.test(url))
 if(forcedOffline()){const c=keep?cacheGet(url):undefined;if(c!==undefined)return c as T;throw netErr()}
 let r:Response;try{r=await fetch(withBase(url),{method,cache:'no-store',credentials:'include',headers,body:b})}catch(e){netDown();const c=keep?cacheGet(url):undefined;if(c!==undefined)return c as T;throw e}
 const j=await r.json().catch(()=>({}));if(!r.ok){const err:any=new Error(j.error||('Request failed ('+r.status+')'));err.data=j;err.status=r.status;throw err}
 if(keep)cachePut(url,j)
 // Tell the shell what the server auto-corrected or wants re-checked (shown as a note to the user).
 const corr=[...(j.corrections||[]),...(j.patient?.corrections||[])],sug=[...(j.suggestions||[]),...(j.patient?.suggestions||[])];if((corr.length||sug.length)&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('hms:corrections',{detail:{corrections:[...new Set(corr)],suggestions:sug}}))
 return j}
export const formObj=(e:React.FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string,string>
export const inr=(n:unknown)=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
export const dt=(s?:string)=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—'

/** Shared, de-duplicated "who am I" lookup: the shell and the page reuse one request (refreshed after 30 s). */
let meP:Promise<any>|null=null,meAt=0
/** Offline: the last signed-in viewer kept on this device, so the desks still open with no internet. */
const offlineOr=(k:string,p:()=>Promise<any>)=>forcedOffline()&&cacheGet(k)!==undefined?Promise.resolve(cacheGet(k)):p().then(x=>{if(x)cachePut(k,x);return x},e=>{if(isNet(e)&&cacheGet(k)!==undefined){netDown();return cacheGet(k)}throw e})
const isNet=(e:any)=>e instanceof TypeError
export function me():Promise<any>{if(!meP||Date.now()-meAt>30000){meAt=Date.now();meP=offlineOr('me',()=>fetch(withBase('/api/auth/me'),{cache:'no-store',credentials:'include'}).then(async r=>{if(!r.ok){const e:any=new Error('Unauthenticated');e.status=r.status;throw e}return r.json()}));meP.catch(()=>{meP=null})}return meP}
export function clearMe(){meP=null;subP=null}
let subP:Promise<any>|null=null,subAt=0
/** Plan/modules for the shell and home. One request shared for 60s so a page change does not refetch it. */
export function subscriptionStatus():Promise<any>{if(!subP||Date.now()-subAt>60000){subAt=Date.now();subP=offlineOr('sub',()=>fetch(withBase('/api/subscription/status'),{cache:'no-store',credentials:'include'}).then(r=>r.ok?r.json():null));subP.catch(()=>{subP=null})}return subP}
