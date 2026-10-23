'use client'
/** Shows connection state + queued offline actions; syncs automatically when back online (and every 30 s). */
import {useEffect,useState} from 'react';import {listQueue,syncQueue,removeQueued,registerSW,Queued} from '@/lib/offline';import {toast} from '@/lib/toast';import {withBase} from '@/lib/basePath'
export default function OfflineBar({onSynced}:{onSynced?:()=>void}){const[on,setOn]=useState(true),[q,setQ]=useState<Queued[]>([]),[need,setNeed]=useState(false)
 useEffect(()=>{registerSW();const refresh=()=>listQueue().then(setQ).catch(()=>{});const sync=async()=>{if(!navigator.onLine)return;const r=await syncQueue();if(r.needLogin)setNeed(true);if(r.done){toast(`Synced ${r.done} offline action(s)`);onSynced?.()}if(r.failed)toast(`${r.failed} offline action(s) need attention`,'err');refresh()}
  const up=()=>{setOn(navigator.onLine);if(navigator.onLine)sync()};setOn(navigator.onLine);refresh();sync();window.addEventListener('online',up);window.addEventListener('offline',up);window.addEventListener('hms:offline-queue',refresh);const t=setInterval(sync,30000)
  return ()=>{window.removeEventListener('online',up);window.removeEventListener('offline',up);window.removeEventListener('hms:offline-queue',refresh);clearInterval(t)}},[])
 const pending=q.filter(x=>x.status==='pending'),failed=q.filter(x=>x.status==='failed'),done=q.filter(x=>x.status==='done').slice(-3)
 if(on&&!pending.length&&!failed.length&&!done.length)return null
 return <div className={'offlineBar '+(on?'online':'offline')} role="status">{on?'● Online':'○ Offline — registrations are saved on this device and sync automatically'}{pending.length>0&&<> · <b>{pending.length} waiting to sync</b> <button className="chip" onClick={()=>syncQueue().then(()=>listQueue().then(setQ))} disabled={!on}>Sync now</button></>}{need&&<> · <a href={withBase('/auth/login?next=/frontdesk')}>Log in again to sync</a></>}
  {failed.map(f=><div key={f.id} className="offFail">⚠ {f.label}: {f.error} <button className="chip" onClick={()=>removeQueued(f.id).then(()=>listQueue().then(setQ))}>Dismiss</button></div>)}
  {done.map(d=><div key={d.id} className="offDone">✓ {d.label}{d.result?.token?` → token #${d.result.token.token_no}`:''}</div>)}</div>}
