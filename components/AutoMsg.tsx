'use client'
import {useEffect} from 'react'
/** Page message that clears itself (6 s), so an old error never hides the next result. Click to dismiss sooner. */
export default function AutoMsg({msg,clear}:{msg:string;clear:()=>void}){useEffect(()=>{if(!msg)return;const t=setTimeout(clear,6000);return()=>clearTimeout(t)},[msg])
 return msg?<div className="toast" role="status" onClick={clear}>{msg}</div>:null}
