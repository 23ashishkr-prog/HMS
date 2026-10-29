/** Offline queue for the front desk (IndexedDB). Each queued action keeps its own Idempotency-Key, so replays never create duplicates. */
import {withBase} from './basePath'
export type Queued={id:string;url:string;method:string;body:any;key:string;label:string;createdAt:number;status:'pending'|'failed'|'done';error?:string;result?:any}
const DB='hms-offline',ST='queue'
function open():Promise<IDBDatabase>{return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore(ST,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx<T>(mode:IDBTransactionMode,f:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction(ST,mode);const q=f(t.objectStore(ST));q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
const uid=()=>(crypto as any).randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)
export const listQueue=()=>tx<Queued[]>('readonly',s=>s.getAll()).then(a=>a.sort((x,y)=>x.createdAt-y.createdAt))
export const putQueued=(q:Queued)=>tx('readwrite',s=>s.put(q))
export const removeQueued=(id:string)=>tx('readwrite',s=>s.delete(id))
export async function enqueueOffline(url:string,method:string,body:any,label:string){const q:Queued={id:uid(),url,method,body,key:'off-'+uid(),label,createdAt:Date.now(),status:'pending'};await putQueued(q);notify();return q}
const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('hms:offline-queue'))}
export const isNetworkError=(e:any)=>e instanceof TypeError||/Failed to fetch|NetworkError|Load failed/i.test(String(e?.message||''))
let syncing=false
/** Replay pending actions in order. Stops on network loss or expired login (401); a 4xx marks that item failed for staff to review. */
export async function syncQueue(f:typeof fetch=fetch):Promise<{done:number;failed:number;left:number;needLogin?:boolean}>{if(syncing)return {done:0,failed:0,left:-1};syncing=true;let done=0,failed=0,needLogin=false
 try{for(const q of await listQueue()){if(q.status!=='pending')continue;let r:Response;try{r=await f(withBase(q.url),{method:q.method,headers:{'Content-Type':'application/json','Idempotency-Key':q.key,'x-offline-queued-at':String(q.createdAt)},body:JSON.stringify(q.body),cache:'no-store'})}catch{break}
  const j=await r.json().catch(()=>({}));if(r.status===401){needLogin=true;break}if(r.status>=500||r.status===429)break
  if(r.ok){await putQueued({...q,status:'done',result:j});done++}else{await putQueued({...q,status:'failed',error:j.error||('HTTP '+r.status)});failed++}}
  for(const q of await listQueue())if(q.status==='done'&&Date.now()-q.createdAt>864e5)await removeQueued(q.id)}finally{syncing=false;notify()}
 const left=(await listQueue()).filter(q=>q.status==='pending').length;return {done,failed,left,needLogin}}
export function registerSW(){if(typeof window!=='undefined'&&'serviceWorker' in navigator)navigator.serviceWorker.register(withBase('/sw.js'),{scope:'/hms/'}).catch(()=>{})}
