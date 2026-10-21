'use client'
import {useEffect,useState} from 'react';import {call} from '@/lib/client';import {toast} from '@/lib/toast'
export type Ap={theme:string;accent:string;density:string;font:string}
export function applyAppearance(a:Partial<Ap>){const d=document.documentElement;for(const k of ['theme','accent','density','font'] as const){const v=(a as any)[k];if(v)d.dataset[k]=v;else delete d.dataset[k]}try{localStorage.setItem('hms.appearance',JSON.stringify(a))}catch{}}
const THEMES=[['light','Light','White & light grey, navy + coral (default)'],['soft','Soft grey','Lower glare, off-white cards'],['dark','Dark','For night shifts and low light']]
const ACC:[string,string,string][]=[['navy','Navy','#104176'],['teal','Teal','#0F766E'],['indigo','Indigo','#4338CA'],['emerald','Emerald','#047857'],['plum','Plum','#7E22CE'],['coral','Coral','#C62828']]
export default function AppearancePanel({isAdmin,onClose}:{isAdmin:boolean;onClose:()=>void}){const[a,setA]=useState<Ap|null>(null),[orig,setOrig]=useState<Ap|null>(null),[busy,setBusy]=useState(false)
 useEffect(()=>{call('/api/me/appearance').then(x=>{setA(x.effective);setOrig(x.effective)}).catch(e=>toast(e.message,'err'))},[])
 const pick=(k:keyof Ap,v:string)=>{if(!a)return;const n={...a,[k]:v};setA(n);applyAppearance(n)}
 const close=()=>{if(orig)applyAppearance(orig);onClose()}
 if(!a)return null
 return <div className="modalBackdrop" onClick={close}><div className="modal wide appearance" role="dialog" aria-label="Appearance" onClick={e=>e.stopPropagation()}><div className="sheetHead"><h2>Appearance</h2><button className="ghost" aria-label="Close" onClick={close}>✕</button></div>
 <h4>Theme</h4><div className="themeGrid">{THEMES.map(([k,l,h])=><button key={k} className={'themeCard t-'+k+(a.theme===k?' on':'')} onClick={()=>pick('theme',k)} aria-pressed={a.theme===k}><span className="tPrev"><i/><em/><em/></span><b>{l}</b><small>{h}</small></button>)}</div>
 <h4>Accent colour</h4><div className="accentRow">{ACC.map(([k,l,c])=><button key={k} className={'accentDot'+(a.accent===k?' on':'')} style={{['--c' as any]:c}} onClick={()=>pick('accent',k)} aria-label={l} title={l}><span/>{l}</button>)}</div>
 <div className="apRow"><div><h4>Density</h4><div className="seg">{[['comfortable','Comfortable'],['compact','Compact']].map(([k,l])=><button key={k} className={a.density===k?'on':''} onClick={()=>pick('density',k)}>{l}</button>)}</div></div>
 <div><h4>Text size</h4><div className="seg">{[['sm','A−'],['md','A'],['lg','A+']].map(([k,l])=><button key={k} className={a.font===k?'on':''} onClick={()=>pick('font',k)} aria-label={'Text size '+k}>{l}</button>)}</div></div></div>
 <div className="apFoot">{isAdmin&&<button className="ghost" disabled={busy} onClick={async()=>{setBusy(true);try{await call('/api/settings/appearance','PUT',a);toast('Saved as the hospital default for everyone who has not chosen their own')}catch(e:any){toast(e.message,'err')}finally{setBusy(false)}}}>Set as hospital default</button>}
 <button className="ghost" onClick={async()=>{try{const x=await call('/api/me/appearance','PUT',{reset:true});applyAppearance(x.effective);setA(x.effective);setOrig(x.effective);toast('Using the hospital default')}catch(e:any){toast(e.message,'err')}}}>Use hospital default</button>
 <button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{const x=await call('/api/me/appearance','PUT',a);applyAppearance(x.effective);setOrig(x.effective);toast('Appearance saved');onClose()}catch(e:any){toast(e.message,'err')}finally{setBusy(false)}}}>Save</button></div></div></div>}
