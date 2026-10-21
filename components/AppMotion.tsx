'use client'
import {useEffect,useRef,useState} from 'react';import {usePathname,useRouter} from 'next/navigation'
/** ColorOS-style app open/close.
 *  Open: tapping an element with [data-app] scales the icon, a window expands from the icon's rect to full screen (FLIP via Web Animations),
 *  home recedes + blurs, then the module fades in. Close: swipe up on the bottom gesture bar (or tap it) shrinks the page back toward its icon.
 *  prefers-reduced-motion: no animation, plain navigation. */
const OPEN=380,CLOSE=320,SPRING='cubic-bezier(.2,.9,.3,1.04)',OUT='cubic-bezier(.22,1,.36,1)'
const reduced=()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches
export default function AppMotion(){const path=usePathname(),router=useRouter();const win=useRef<HTMLDivElement|null>(null);const[bar,setBar]=useState(false)
 useEffect(()=>{function onClick(e:MouseEvent){const a=(e.target as HTMLElement)?.closest?.('a[data-app]') as HTMLAnchorElement|null;if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||a.target==='_blank')return
   const href=a.getAttribute('href')||'';if(!href.startsWith('/'))return;e.preventDefault();const ic=(a.querySelector('.ic3d,img,svg,[data-app-icon]') as HTMLElement)||a;const r=ic.getBoundingClientRect()
   sessionStorage.setItem('appOrigin',JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height,from:location.pathname}))
   if(reduced()){router.push(href);return}
   ic.animate([{transform:'scale(1)'},{transform:'scale(.9)'},{transform:'scale(1.06)'}],{duration:180,easing:OUT})
   document.documentElement.classList.add('appLaunching')
   const w=document.createElement('div');w.className='appWin';document.body.appendChild(w);win.current=w
   const W=innerWidth,H=innerHeight;w.animate([{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:'16px',opacity:.85},{left:'0px',top:'0px',width:W+'px',height:H+'px',borderRadius:'0px',opacity:1}],{duration:OPEN,easing:SPRING,fill:'forwards'})
   setTimeout(()=>router.push(href),OPEN*.7)}
  document.addEventListener('click',onClick,true);return()=>document.removeEventListener('click',onClick,true)},[router])
 useEffect(()=>{const w=win.current;document.documentElement.classList.remove('appLaunching');if(w){win.current=null;const m=document.querySelector('.mainCol, main') as HTMLElement|null;m?.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:300,easing:OUT})
   const a=w.animate([{opacity:1},{opacity:0}],{duration:240,delay:60,easing:OUT,fill:'forwards'});a.onfinish=()=>w.remove()}
  if(path==='/'&&sessionStorage.getItem('appReturn')){sessionStorage.removeItem('appReturn');if(!reduced())(document.querySelector('.mainCol') as HTMLElement|null)?.animate([{transform:'scale(.94)',filter:'blur(6px)',opacity:.6},{transform:'none',filter:'none',opacity:1}],{duration:340,easing:OUT})}
  setBar(false);const t=setInterval(()=>{if(document.querySelector('.mainCol')){setBar(path!=='/');clearInterval(t)}},150);const k=setTimeout(()=>clearInterval(t),6000);return()=>{clearInterval(t);clearTimeout(k)}},[path])
 function close(){let o:any=null;try{o=JSON.parse(sessionStorage.getItem('appOrigin')||'null')}catch{};const back=o?.from||'/';sessionStorage.setItem('appReturn','1')
  const m=document.querySelector('.mainCol')?.parentElement as HTMLElement|null||document.body
  if(reduced()||!m){router.push(back);return}
  const W=innerWidth,H=innerHeight,tx=o?o.x+o.w/2-W/2:0,ty=o?o.y+o.h/2-H/2:H*.35,s=o?Math.max(o.w/W,.08):.2
  m.style.transformOrigin='50% 50%';const a=m.animate([{transform:'none',borderRadius:'0px',opacity:1},{transform:`translate(${tx}px,${ty}px) scale(${s})`,borderRadius:'48px',opacity:.2}],{duration:CLOSE,easing:OUT,fill:'forwards'})
  a.onfinish=()=>{router.push(back);setTimeout(()=>a.cancel(),60)}}
 const y0=useRef<number|null>(null)
 if(!bar)return null
 return <div className="gestureZone" onPointerDown={e=>{y0.current=e.clientY;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)}} onPointerMove={e=>{if(y0.current!=null&&y0.current-e.clientY>48){y0.current=null;close()}}} onPointerUp={()=>{if(y0.current!=null){y0.current=null;close()}}} role="button" aria-label="Back to home (swipe up)" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')close()}}><span className="gestureBar"/></div>}
