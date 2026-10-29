'use client'
import {useEffect,useState} from 'react'
import {call} from '@/lib/client'
import {withBase} from '@/lib/basePath'
/** One small line instead of a card. Dismissal is stored per user and shared by home and the consultation desk. */
export default function AiUpsellLine(){
 const[on,setOn]=useState(false)
 useEffect(()=>{let live=true;call('/api/me/dismissals').then(x=>{if(live)setOn(!(x.keys||[]).includes('ai_upsell'))}).catch(()=>{if(live)setOn(true)});return()=>{live=false}},[])
 if(!on)return null
 return <p className="aiLine" role="status">AI assistant is not included on this plan. <a href={withBase('/welcome#pricing')}>See pricing</a> <button type="button" className="ghost" onClick={()=>{setOn(false);call('/api/me/dismissals','PUT',{key:'ai_upsell',dismissed:true}).catch(()=>setOn(true))}}>Dismiss</button></p>
}
