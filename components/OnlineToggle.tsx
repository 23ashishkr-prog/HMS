'use client'
import {useEffect,useState} from 'react';import {call} from '@/lib/client';import {toast} from '@/lib/toast'
/** Doctor's own "Online / Offline" switch (shown only to doctors). Offline doctors are hidden from QR check-in and shown as offline at the front desk. */
export default function OnlineToggle(){const[d,setD]=useState<any>(null);useEffect(()=>{call('/api/doctors/schedule').then(x=>{if(x.self&&x.doctor)setD(x.doctor)}).catch(()=>{})},[]);if(!d)return null
 return <label className="switch" title="Patients can self check-in and book with you only while online"><input type="checkbox" checked={!!d.online} onChange={async e=>{const on=e.target.checked;try{await call('/api/doctors/schedule','POST',{action:'online',online:on});setD({...d,online:on});toast(on?'You are online':'You are offline')}catch(x:any){toast(x.message,'err')}}}/><span/>{d.online?'Online':'Offline'}</label>}
