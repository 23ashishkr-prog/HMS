'use client'
import {useEffect,useMemo,useState} from 'react';import TimeRoller from '@/components/TimeRoller';import {daySlots,openRoll} from '@/lib/openslots'
const ist=(d:Date)=>new Date(d.getTime()+330*60000).toISOString().slice(0,10)
/** Follow-up booking with the time roller: date chips (from the follow-up date) + only the doctor's free times. */
export default function FollowupBook({doctorId,from,onBook}:{doctorId:string;from:string;onBook:(iso:string)=>void}){
 const days=useMemo(()=>{const b=new Date(Math.max(Date.now(),new Date(String(from).slice(0,10)+'T06:00:00Z').getTime()));return Array.from({length:7},(_,i)=>ist(new Date(b.getTime()+i*864e5)))},[from])
 const[date,setDate]=useState(days[0]),[x,setX]=useState<any>(null),[pick,setPick]=useState('')
 useEffect(()=>{setX(null);fetch('/api/appointments?'+new URLSearchParams({doctorId,date}),{cache:'no-store'}).then(r=>r.json()).then(setX).catch(()=>setX({}))},[doctorId,date])
 const roll=useMemo(()=>x?openRoll(daySlots(x,date)):null,[x,date])
 return <div className="fuBook"><div className="chips dateChips">{days.map(d=><button type="button" key={d} className={'chip'+(d===date?' on':'')} onClick={()=>setDate(d)}>{new Date(d+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</button>)}</div>
  <TimeRoller label="Follow-up time" slots={roll} value={pick} onChange={setPick} sessions={false}/><button type="button" className="primary" disabled={!pick} onClick={()=>onBook(new Date(pick+'+05:30').toISOString())}>Book</button></div>}
