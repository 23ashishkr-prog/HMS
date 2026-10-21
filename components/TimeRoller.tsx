'use client'
import {useEffect,useMemo,useRef,useState} from 'react'
/** Alarm-style scroll-wheel time picker (iOS / ColorOS roller): scroll-snap, native momentum, highlighted centre row.
 *  Touch, mouse wheel, click, and keyboard (↑/↓/Home/End/PageUp/PageDown). Lists only the slots passed in (available ones).
 *  Optional Morning/Afternoon/Evening session chips. Slot: {value, label, hour?} — hour (IST, 0-23) is parsed from label when absent. */
export type RollSlot={value:string;label:string;hour?:number}
const ROW=44,VIS=5
const hourOf=(s:RollSlot)=>{if(typeof s.hour==='number')return s.hour;const m=s.label.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);if(!m)return 12;let h=Number(m[1]);const ap=m[3]?.toLowerCase();if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;return h}
const SESS=[['all','Any time'],['m','Morning'],['a','Afternoon'],['e','Evening']] as const
const inSess=(h:number,s:string)=>s==='all'||(s==='m'?h<12:s==='a'?h>=12&&h<17:h>=17)
export default function TimeRoller({slots,value,onChange,label='Time',sessions=true,emptyText='No free times this day.'}:{slots:RollSlot[]|null;value:string;onChange:(v:string)=>void;label?:string;sessions?:boolean;emptyText?:string}){
 const[sess,setSess]=useState('all');const ref=useRef<HTMLDivElement>(null),t=useRef<any>(null),prog=useRef(false)
 const have=useMemo(()=>{const o:any={};(slots||[]).forEach(s=>{const h=hourOf(s);['m','a','e'].forEach(k=>{if(inSess(h,k))o[k]=1})});return o},[slots])
 const list=useMemo(()=>(slots||[]).filter(s=>inSess(hourOf(s),sess)),[slots,sess])
 const idx=Math.max(0,list.findIndex(s=>s.value===value))
 useEffect(()=>{if(list.length&&!list.some(s=>s.value===value))onChange(list[0].value)},[list]) // eslint-disable-line
 useEffect(()=>{const el=ref.current;if(!el)return;const top=idx*ROW;if(Math.abs(el.scrollTop-top)>2){prog.current=true;el.scrollTo({top,behavior:'smooth'});setTimeout(()=>prog.current=false,350)}},[idx,list.length])
 function onScroll(){clearTimeout(t.current);t.current=setTimeout(()=>{const el=ref.current;if(!el||prog.current)return;const i=Math.min(list.length-1,Math.max(0,Math.round(el.scrollTop/ROW)));if(list[i]&&list[i].value!==value)onChange(list[i].value)},90)}
 function key(e:React.KeyboardEvent){const n=list.length;if(!n)return;const map:any={ArrowDown:1,ArrowUp:-1,PageDown:4,PageUp:-4};let j=idx;if(e.key in map)j=idx+map[e.key];else if(e.key==='Home')j=0;else if(e.key==='End')j=n-1;else return;e.preventDefault();j=Math.max(0,Math.min(n-1,j));onChange(list[j].value)}
 if(slots===null)return <div className="rollWrap"><small className="muted">Loading times…</small></div>
 return <div className="rollWrap">
  {sessions&&slots.length>4&&<div className="chips rollSess" role="group" aria-label="Session">{SESS.filter(([k])=>k==='all'||have[k]).map(([k,l])=><button type="button" key={k} className={'chip'+(sess===k?' on':'')} aria-pressed={sess===k} onClick={()=>setSess(k)}>{l}</button>)}</div>}
  {list.length?<div className="roller" style={{height:ROW*VIS}}>
   <div className="rollHi" aria-hidden/>
   <div ref={ref} className="rollList" role="listbox" tabIndex={0} aria-label={label} aria-activedescendant={'roll-'+idx} onScroll={onScroll} onKeyDown={key} style={{paddingTop:ROW*2,paddingBottom:ROW*2}}>
    {list.map((s,i)=><div id={'roll-'+i} key={s.value} role="option" aria-selected={i===idx} className={'rollItem d'+Math.min(3,Math.abs(i-idx))} style={{height:ROW}} onClick={()=>onChange(s.value)}>{s.label}</div>)}
   </div></div>:<small className="muted">{emptyText}</small>}
  {list.length>0&&<small className="rollCount">{list.length} free time{list.length>1?'s':''}{sess!=='all'?' in this session':''}</small>}</div>}
