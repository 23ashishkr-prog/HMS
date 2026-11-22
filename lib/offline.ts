/**
 * Offline queue for the desks (IndexedDB). Each queued action keeps its own Idempotency-Key, so replays never create
 * duplicates. Nothing is ever dropped:
 *  - network down, server error, signed out (401), plan on hold (402) or read-only → replay stops, everything stays queued;
 *  - any other refusal (e.g. 409 possible duplicate) is kept as "failed" with the reason for staff to review;
 *  - a step may refer to the result of an earlier step with {{ref:<id>:<path>}} (e.g. finish the encounter that the
 *    first step opens). If that earlier step could not be saved, the later one is kept as failed, never sent blind.
 * Each action carries the signed offline licence it was made under; the server checks it on replay.
 */
import {withBase} from './basePath'
export type Queued={id:string;url:string;method:string;body:any;key:string;label:string;createdAt:number;status:'pending'|'failed'|'done';error?:string;result?:any;licence?:string|null}
export const LICENCE_KEY='hms-offline-licence'
const DB='hms-offline',ST='queue'
function open():Promise<IDBDatabase>{return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore(ST,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx<T>(mode:IDBTransactionMode,f:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction(ST,mode);const q=f(t.objectStore(ST));q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
const uid=()=>typeof crypto!=='undefined'&&(crypto as any).randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)
export const listQueue=()=>tx<Queued[]>('readonly',s=>s.getAll()).then(a=>a.sort((x,y)=>x.createdAt-y.createdAt))
export const putQueued=(q:Queued)=>tx('readwrite',s=>s.put(q))
export const removeQueued=(id:string)=>tx('readwrite',s=>s.delete(id)).then(r=>{notify();return r})
function currentLicence():string|null{try{const r=JSON.parse(localStorage.getItem(LICENCE_KEY)||'null');return r?.kind==='licence'?r.token:null}catch{return null}}
/** Pass the key the online attempt already used, so a request that reached the server before the network dropped is replayed, not duplicated. */
/** Queue order = createdAt, so it must strictly increase even for two actions in the same millisecond. */
let lastAt=0
const nextAt=()=>{lastAt=Math.max(Date.now(),lastAt+1);return lastAt}
export async function enqueueOffline(url:string,method:string,body:any,label:string,key?:string){const q:Queued={id:uid(),url,method,body,key:key||'off-'+uid(),label,createdAt:nextAt(),status:'pending',licence:currentLicence()};await putQueued(q);notify();return q}
/** Placeholder for "the value at <path> in the server's answer to queued step <id>", e.g. ref(q.id,'encounter.id'). */
export const ref=(id:string,path:string)=>`{{ref:${id}:${path}}}`
const REF=/\{\{ref:([\w-]+):([\w.]+)\}\}/g
const pick=(o:any,path:string)=>path.split('.').reduce((a,k)=>a==null?a:a[k],o)
/** Fills placeholders from earlier steps. Returns null + the missing step id when an earlier step has no answer. */
export function resolveRefs(q:Queued,all:Queued[]):{url:string;body:any}|{missing:Queued|null}{
 const byId=new Map(all.map(x=>[x.id,x]));let missing:Queued|null|undefined
 const fill=(s:string)=>s.replace(REF,(m,id,path)=>{const src=byId.get(id);const v=src?.status==='done'?pick(src.result,path):undefined;if(v==null){missing=src??null;return m}return String(v)})
 const url=fill(q.url),body=q.body==null?q.body:JSON.parse(fill(JSON.stringify(q.body)))
 return missing!==undefined?{missing}:{url,body}}
const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('hms:offline-queue'))}
export const isNetworkError=(e:any)=>e instanceof TypeError||e?.offline===true||/Failed to fetch|NetworkError|Load failed/i.test(String(e?.message||''))
let syncing=false
export type SyncResult={done:number;failed:number;left:number;needLogin?:boolean;locked?:boolean}
/** Replay pending actions in order. Stops on network loss, expired login (401) or plan on hold (402 / read-only); other refusals are kept as failed for staff to review. */
export async function syncQueue(f:typeof fetch=fetch):Promise<SyncResult>{if(syncing)return {done:0,failed:0,left:-1};syncing=true;let done=0,failed=0,needLogin=false,locked=false
 try{for(const q0 of await listQueue()){if(q0.status!=='pending')continue
  const all=await listQueue(),q=all.find(x=>x.id===q0.id)||q0,res=resolveRefs(q,all)
  if('missing' in res){if(res.missing&&res.missing.status==='pending')break;await putQueued({...q,status:'failed',error:`Not sent because an earlier step${res.missing?` ("${res.missing.label}")`:''} could not be saved. Nothing was lost — please check and redo it.`});failed++;continue}
  let r:Response;try{r=await f(withBase(res.url),{method:q.method,headers:{'Content-Type':'application/json','Idempotency-Key':q.key,'x-offline-queued-at':String(q.createdAt),...(q.licence?{'x-offline-licence':q.licence}:{})},body:JSON.stringify(res.body),cache:'no-store'})}catch{break}
  const j=await r.json().catch(()=>({}));if(r.status===401){needLogin=true;break}if(r.status>=500||r.status===429||r.status===408)break
  if(r.status===402||j.onHold||j.readOnly){locked=true;break}
  if(r.ok){await putQueued({...q,status:'done',result:j});done++}else{await putQueued({...q,status:'failed',error:j.error||('HTTP '+r.status)});failed++}}
  for(const q of await listQueue())if(q.status==='done'&&Date.now()-q.createdAt>864e5)await removeQueued(q.id)}finally{syncing=false;notify()}
 const left=(await listQueue()).filter(q=>q.status==='pending').length;return {done,failed,left,needLogin,locked}}
export function registerSW(){if(typeof window!=='undefined'&&'serviceWorker' in navigator)navigator.serviceWorker.register(withBase('/sw.js'),{scope:'/hms/'}).catch(()=>{})}
