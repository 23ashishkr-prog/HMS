'use client'
/**
 * Offline mode status for every desk: online / offline, days of offline use left, what is waiting to sync, and the
 * reconnect-to-renew message. Keeps the signed offline licence fresh while online (that re-checks the plan) and syncs
 * the queue as soon as the connection is back. <OfflineGate> covers a desk when offline use isn't allowed.
 */
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react'
import {listQueue,syncQueue,removeQueued,registerSW,enqueueOffline,isNetworkError,LICENCE_KEY,type Queued} from '@/lib/offline'
import {fromServer,loadLicence,offlineMode,saveLicence,touch,type OfflineMode,type StoredLicence} from '@/lib/offline/licenceState'
import {call,idemKey,forcedOffline,setForcedOffline} from '@/lib/client'
import {toast} from '@/lib/toast';import {withBase} from '@/lib/basePath'
type Ctx={offline:boolean;forced:boolean;mode:OfflineMode;canWorkOffline:boolean;queue:Queued[]}
const OfflineCtx=createContext<Ctx|null>(null)
export const useOfflineMode=()=>useContext(OfflineCtx)
/** For code outside React: may a write be saved offline right now? */
export function offlineAllowed(){return offlineMode(loadLicence(LICENCE_KEY),Date.now()).mode==='ready'}
export function offlineRefusal(){const m=offlineMode(loadLicence(LICENCE_KEY),Date.now()).mode;return m==='disabled'?'No internet. This hospital is in Live mode, so this needs the internet.':m==='locked'?'No internet, and offline mode is locked because the plan is not active.':m==='expired'?'Offline mode has ended (30 days). Connect to the internet so the plan can be checked.':'No internet, and offline mode is not set up on this device yet. Connect once to turn it on.'}
const fmt=(ms:number)=>new Date(ms).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})

export function OfflineProvider({children}:{children:React.ReactNode}){
 const[rec,setRec]=useState<StoredLicence|null>(null),[net,setNet]=useState(true),[reach,setReach]=useState(true),[forced,setForced]=useState(false),[tick,setTick]=useState(()=>Date.now()),[queue,setQueue]=useState<Queued[]>([]),[needLogin,setNeedLogin]=useState(false)
 const recRef=useRef(rec);recRef.current=rec
 const refreshQ=useCallback(()=>listQueue().then(setQueue).catch(()=>{}),[])
 const renew=useCallback(async()=>{try{const r=await fetch(withBase('/api/offline/licence'),{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)return;const n=fromServer(await r.json(),Date.now(),recRef.current);setRec(n);saveLicence(LICENCE_KEY,n)}catch{setReach(false)}},[])
 const sync=useCallback(async()=>{if(!navigator.onLine||forcedOffline())return;const r=await syncQueue();if(r.needLogin)setNeedLogin(true);if(r.done){toast(`Synced ${r.done} offline change(s)`);window.dispatchEvent(new Event('hms:offline-synced'))}if(r.failed)toast(`${r.failed} offline change(s) need a look`,'err');refreshQ()},[refreshQ])
 useEffect(()=>{registerSW();setRec(loadLicence(LICENCE_KEY));setForced(forcedOffline());setNet(navigator.onLine);refreshQ()
  const up=()=>setNet(navigator.onLine),q=()=>refreshQ(),n=(e:Event)=>{setForced(forcedOffline());if((e as CustomEvent).detail?.down)setReach(false)}
  window.addEventListener('online',up);window.addEventListener('offline',up);window.addEventListener('hms:offline-queue',q);window.addEventListener('hms:net',n)
  return()=>{window.removeEventListener('online',up);window.removeEventListener('offline',up);window.removeEventListener('hms:offline-queue',q);window.removeEventListener('hms:net',n)}},[refreshQ])
 // Heartbeat: is the server reachable? Also moves the clock guard forward so winding the device clock back doesn't help.
 useEffect(()=>{let stop=false;const beat=async()=>{setTick(Date.now());setRec(r=>{const n=touch(r,Date.now());if(n!==r)saveLicence(LICENCE_KEY,n);return n});if(!navigator.onLine){setReach(false);return}try{const r=await fetch(withBase('/api/offline/ping'),{cache:'no-store'});if(!stop)setReach(r.ok)}catch{if(!stop)setReach(false)}};beat();const t=setInterval(beat,20000);return()=>{stop=true;clearInterval(t)}},[])
 const back=net&&reach&&!forced
 // While online: re-check the plan every 30 min, or every 2 min while offline mode is locked/expired (so a renewal unlocks it quickly).
 useEffect(()=>{if(!back)return;let last=Date.now();renew().then(sync);const t=setInterval(()=>{const r=recRef.current;const ready=offlineMode(r,Date.now()).mode==='ready';if(!ready||Date.now()-last>=30*60000){last=Date.now();renew().then(sync)}else sync()},2*60000);return()=>clearInterval(t)},[back,renew,sync])
 const mode=offlineMode(rec,tick)
 const v:Ctx={offline:!back,forced,mode,canWorkOffline:mode.mode==='ready',queue}
 return <OfflineCtx.Provider value={v}>{children}{needLogin&&back&&<div className="banner warn">Sign in again to send the changes saved offline. <a href={withBase('/auth/login')}>Sign in</a></div>}</OfflineCtx.Provider>}

/** The status strip shown above every desk. */
export default function OfflineBar(){const o=useOfflineMode();const[open,setOpen]=useState(false);if(!o)return null
 const {offline,forced,mode,queue}=o,pending=queue.filter(x=>x.status==='pending'),failed=queue.filter(x=>x.status==='failed'),done=queue.filter(x=>x.status==='done').slice(-3)
 const days=mode.mode==='ready'?mode.daysLeft:0,pl=(n:number,w:string)=>`${n} ${w}${n===1?'':'s'}`
 let text:React.ReactNode
 if(!offline)text=<><b>● Online</b>{mode.mode==='ready'?` · Offline mode ready (${pl(days,'day')})`:mode.mode==='disabled'?' · Live mode — this hospital works online only (change it in Settings)':''}{mode.mode==='locked'?` · Plan not active — offline mode is locked until it is renewed${pending.length?`. ${pl(pending.length,'saved change')} kept on this device; ${pending.length===1?'it syncs':'they sync'} after renewal`:''}`:pending.length?` · Syncing ${pl(pending.length,'saved change')}…`:mode.mode==='ready'?' · All changes synced':''}</>
 else if(mode.mode==='ready')text=<><b>○ Offline{forced?' (switched on)':''}</b> — keep working; changes are saved on this device{pending.length?` (${pending.length} waiting)`:''} and sync when you are back online. <b>{pl(days,'day')} of offline use left</b> — connect to the internet before {fmt(mode.until)} to renew.</>
 else text=<><b>○ Offline</b>{pending.length?` · ${pl(pending.length,'saved change')} waiting to sync`:''}</>
 return <div className={'offlineBar '+(offline?(mode.mode==='ready'&&days>5?'offline':'offline danger'):'online')} role="status">{text}
  {mode.mode!=='disabled'&&(forced?<> <button className="chip" onClick={()=>setForcedOffline(false)}>Go live</button></>:!offline&&mode.mode==='ready'&&<> <button className="chip" title="For a patchy connection: everything is saved here and synced later" onClick={()=>setForcedOffline(true)}>Work offline</button></>)}
  {pending.length>0&&!offline&&<> <button className="chip" onClick={()=>syncQueue().then(()=>window.dispatchEvent(new Event('hms:offline-queue')))}>Sync now</button></>}
  {failed.length>0&&<> <button className="chip" onClick={()=>setOpen(x=>!x)}>{failed.length} need{failed.length===1?'s':''} a look</button></>}
  {open&&failed.map(f=><div key={f.id} className="offFail">⚠ {f.label}: {f.error} — kept on this device, nothing lost. <button className="chip" onClick={()=>removeQueued(f.id)}>Done, dismiss</button></div>)}
  {done.map(d=><div key={d.id} className="offDone">✓ {d.label}{d.result?.token?` → token #${d.result.token.token_no}`:''}{d.result?.invoice?.invoice_no?` → bill ${d.result.invoice.invoice_no}`:''}</div>)}</div>}

/** Covers a desk when it is offline and offline mode is not allowed (30 days up, plan not active, or Live mode). */
export function OfflineGate({children}:{children:React.ReactNode}){const o=useOfflineMode();if(!o||!o.offline||o.mode.mode==='ready')return <>{children}</>
 const m=o.mode,pending=o.queue.filter(x=>x.status==='pending').length
 const [title,body]=m.mode==='expired'?['Offline mode has ended',`This device has worked offline for 30 days (until ${fmt(m.until)}). Connect to the internet once so we can check your plan — if it is active, offline mode unlocks for another 30 days.`]:m.mode==='locked'?['Offline mode is locked','The hospital plan is not active, so offline mode is off. Connect to the internet and renew the plan to unlock it.']:m.mode==='disabled'?['Live mode — internet needed','This hospital is set to Live mode, so the desks need the internet. An admin can switch to Offline mode in Settings.']:['Connect to the internet','This device has not been set up for offline use yet. Connect once and offline mode turns on for 30 days.']
 return <div className="offGate"><div aria-hidden className="offGateUnder">{children}</div><div role="alert" className="card offGateCard"><h2>{title}</h2><p>{body}</p>{pending>0&&<p className="offDone">{pending} change{pending===1?' is':'s are'} saved on this device and will be sent as soon as you reconnect. Nothing is lost.</p>}{o.forced&&<button className="primary" onClick={()=>setForcedOffline(false)}>Go live</button>}</div></div>}

/**
 * Send a write now, or — with no internet — keep it in the offline queue under the SAME Idempotency-Key, so a request
 * that reached the server just before the connection dropped is never applied twice. URLs may hold {{ref:…}} steps.
 */
export async function saveOrQueue<T=any>(url:string,method:string,body:any,label:string):Promise<T|{queued:true;id:string}>{
 const key=idemKey(method,url,JSON.stringify(body??{}))
 const queue=async()=>{if(!offlineAllowed())throw new Error(offlineRefusal());const q=await enqueueOffline(url,method,body,label,key);return {queued:true as const,id:q.id}}
 if(url.includes('{{ref:'))return queue() // depends on a step that is itself still waiting to sync
 try{return await call<T>(url,method,body,{key})}catch(e){if(isNetworkError(e))return queue();throw e}}
