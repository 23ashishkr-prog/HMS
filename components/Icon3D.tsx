/* Original glass app-icon set (authored for this project; no third-party assets; same licence as the repo).
   Each icon = iOS-like squircle tile, 3-stop gradient, radial glass sheen, rim highlight, glyph with tinted shadow. */
import React from 'react'
export type IconName='dashboard'|'frontdesk'|'doctor'|'billing'|'pharmacy'|'lab'|'ipd'|'patients'|'calendar'|'insurance'|'settings'|'audit'|'search'|'money'|'queue'|'beds'
/* StarDeck palette: navy tiles; coral for money/medicine/compliance desks. */
const C:Record<IconName,[string,string,string]>={dashboard:['#5A80B8','#104176','#0B2E55'],frontdesk:['#5A80B8','#104176','#0B2E55'],doctor:['#5A80B8','#104176','#0B2E55'],billing:['#F07A7A','#E33737','#B82424'],pharmacy:['#F07A7A','#E33737','#B82424'],lab:['#5A80B8','#104176','#0B2E55'],ipd:['#5A80B8','#104176','#0B2E55'],patients:['#5A80B8','#104176','#0B2E55'],calendar:['#5A80B8','#104176','#0B2E55'],insurance:['#F07A7A','#E33737','#B82424'],settings:['#5A80B8','#104176','#0B2E55'],audit:['#F07A7A','#E33737','#B82424'],search:['#5A80B8','#104176','#0B2E55'],money:['#F07A7A','#E33737','#B82424'],queue:['#5A80B8','#104176','#0B2E55'],beds:['#5A80B8','#104176','#0B2E55']}
const G:Record<IconName,React.ReactNode>={
 dashboard:<><rect x="15" y="15" width="14" height="18" rx="3"/><rect x="35" y="15" width="14" height="10" rx="3"/><rect x="35" y="31" width="14" height="18" rx="3"/><rect x="15" y="39" width="14" height="10" rx="3"/></>,
 frontdesk:<><circle cx="32" cy="22" r="8"/><path d="M16 48c0-9 7-14 16-14s16 5 16 14z"/></>,
 patients:<><circle cx="25" cy="23" r="7"/><circle cx="41" cy="25" r="6" opacity=".8"/><path d="M12 47c0-8 6-12 13-12s13 4 13 12zM36 47c0-5-2-8-4-10 2-1 5-2 9-2 6 0 11 4 11 12z" /></>,
 doctor:<><path d="M22 14v12a10 10 0 0 0 20 0V14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/><path d="M32 36v4a8 8 0 0 0 16 0v-4" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"/><circle cx="48" cy="33" r="5"/></>,
 billing:<><path d="M18 12h28v40l-5-4-5 4-4-4-5 4-4-4-5 4z"/><rect x="24" y="22" width="16" height="4" rx="2" fill="#0003"/><rect x="24" y="31" width="12" height="4" rx="2" fill="#0003"/></>,
 money:<><rect x="12" y="20" width="40" height="24" rx="5"/><circle cx="32" cy="32" r="6" fill="#0002"/></>,
 pharmacy:<><rect x="14" y="24" width="36" height="16" rx="8" transform="rotate(-35 32 32)"/><path d="M32 32l-9 13a8 8 0 0 1-11-12l9-6z" fill="#0002"/></>,
 lab:<><path d="M26 12h12v4h-2v12l11 18a4 4 0 0 1-4 6H21a4 4 0 0 1-4-6l11-18V16h-2z"/><path d="M21 42h22l3 5a2 2 0 0 1-2 3H20a2 2 0 0 1-2-3z" fill="#0002"/></>,
 ipd:<><rect x="10" y="30" width="44" height="10" rx="3"/><rect x="10" y="18" width="6" height="30" rx="2"/><rect x="48" y="34" width="6" height="14" rx="2"/><rect x="18" y="22" width="14" height="8" rx="4"/></>,
 beds:<><rect x="10" y="30" width="44" height="10" rx="3"/><rect x="10" y="18" width="6" height="30" rx="2"/><rect x="18" y="22" width="14" height="8" rx="4"/></>,
 calendar:<><rect x="13" y="16" width="38" height="34" rx="6"/><rect x="13" y="16" width="38" height="10" rx="5" fill="#0002"/><rect x="21" y="11" width="5" height="10" rx="2"/><rect x="38" y="11" width="5" height="10" rx="2"/><circle cx="26" cy="37" r="3" fill="#0003"/><circle cx="38" cy="37" r="3" fill="#0003"/></>,
 insurance:<><path d="M32 11l18 7v12c0 12-8 20-18 24-10-4-18-12-18-24V18z"/><path d="M25 32l5 5 10-11" fill="none" stroke="#0004" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></>,
 settings:<><circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="6" fill="#0003"/>{[0,45,90,135].map(a=><rect key={a} x="29" y="10" width="6" height="44" rx="2" transform={`rotate(${a} 32 32)`}/>)}</>,
 audit:<><rect x="16" y="12" width="32" height="40" rx="5"/><rect x="22" y="22" width="20" height="4" rx="2" fill="#0003"/><rect x="22" y="30" width="20" height="4" rx="2" fill="#0003"/><rect x="22" y="38" width="12" height="4" rx="2" fill="#0003"/></>,
 search:<><circle cx="28" cy="28" r="13" fill="none" stroke="#fff" strokeWidth="6"/><rect x="38" y="36" width="8" height="18" rx="3" transform="rotate(-45 42 45)"/></>,
 queue:<><rect x="14" y="14" width="36" height="36" rx="18"/><text x="32" y="40" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0005" fontFamily="system-ui">#</text></>}
/* iOS-style continuous-corner squircle (superellipse approximation) */
const SQ='M32 2C9.5 2 2 9.5 2 32s7.5 30 30 30 30-7.5 30-30S54.5 2 32 2z'
/** Flat, modern icon tile: tinted rounded square + solid glyph. Colours come from CSS variables so the same icon adapts to
 *  light cards (accent tint), the navy sidebar (white on translucent) and the user's accent preset. Coral tone for money/medicine/compliance. */
const CORAL:IconName[]=['billing','pharmacy','insurance','audit','money']
/** ColorOS-style vivid tile gradients (navy/coral family + friendly accents), used when the "colour" icon style is active. */
const TONE:Record<IconName,[string,string]>={dashboard:['#4F7BFF','#2747C9'],frontdesk:['#36B3FF','#1769E0'],doctor:['#2BC7A4','#0E8F7A'],billing:['#FF8A7A','#E33737'],money:['#FFB35C','#F06A2A'],pharmacy:['#FF7AA8','#E0336E'],lab:['#9B7BFF','#5B3FD9'],ipd:['#3FC7E8','#1186B5'],beds:['#3FC7E8','#1186B5'],patients:['#5AA0FF','#104176'],calendar:['#FF9F5A','#EE5A24'],insurance:['#7C8CFF','#3D49C8'],settings:['#8E9BB0','#4D5A70'],audit:['#F07A7A','#B82424'],search:['#5A80B8','#104176'],queue:['#4FD1A5','#119A6E']}
export default function Icon3D({name,size=28}:{name:IconName;size?:number}){const [a,b]=TONE[name]||TONE.dashboard;return <svg className={'appIcon'+(CORAL.includes(name)?' tone-coral':'')} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{['--t1' as any]:a,['--t2' as any]:b}}>
 <defs><linearGradient id={'ic-'+name} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a}/><stop offset="1" stopColor={b}/></linearGradient></defs>
 <rect x="0" y="0" width="64" height="64" rx="20" className="icBg" data-grad={'url(#ic-'+name+')'}/>
 <g className="icFg" transform="translate(32 32) scale(.62) translate(-32 -32)">{G[name]}</g></svg>}
