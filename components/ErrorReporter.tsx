'use client'
import {useEffect} from 'react'
import {withBase} from '@/lib/basePath'
let sent=0
/** Sends uncaught browser errors (max 5 per page load) to /api/incidents/client. Only message, stack and path; never form data. */
export function reportClientError(e:unknown){if(typeof window==='undefined'||sent>=5)return;sent++;const err:any=e instanceof Error?e:{message:String((e as any)?.reason?.message||(e as any)?.message||e)};try{navigator.sendBeacon?.(withBase('/api/incidents/client'),new Blob([JSON.stringify({message:String(err.message||'error').slice(0,500),stack:String(err.stack||'').slice(0,3000),route:location.pathname})],{type:'application/json'}))}catch{}}
export default function ErrorReporter(){useEffect(()=>{const a=(e:ErrorEvent)=>reportClientError(e.error||e.message);const b=(e:PromiseRejectionEvent)=>reportClientError(e.reason instanceof Error?e.reason:new Error('Unhandled rejection: '+String(e.reason?.message||e.reason)));window.addEventListener('error',a);window.addEventListener('unhandledrejection',b);return()=>{window.removeEventListener('error',a);window.removeEventListener('unhandledrejection',b)}},[]);return null}
