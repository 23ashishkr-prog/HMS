/* Original glass app-icon set (authored for this project; no third-party assets; same licence as the repo).
   Each icon = iOS-like squircle tile, 3-stop gradient, radial glass sheen, rim highlight, glyph with tinted shadow. */
import React from 'react'
export type IconName='dashboard'|'frontdesk'|'doctor'|'billing'|'pharmacy'|'lab'|'ipd'|'patients'|'calendar'|'insurance'|'settings'|'audit'|'search'|'money'|'queue'|'beds'
const C:Record<IconName,[string,string,string]>={dashboard:['#a78bfa','#6366f1','#4338ca'],frontdesk:['#67e8f9','#3b82f6','#1d4ed8'],doctor:['#6ee7b7','#10b981','#047857'],billing:['#fde68a','#f59e0b','#c2410c'],pharmacy:['#f9a8d4','#ec4899','#9d174d'],lab:['#c4b5fd','#8b5cf6','#5b21b6'],ipd:['#fda4af','#f43f5e','#9f1239'],patients:['#93c5fd','#3b82f6','#1e3a8a'],calendar:['#99f6e4','#14b8a6','#115e59'],insurance:['#cbd5e1','#64748b','#334155'],settings:['#e4e4e7','#71717a','#27272a'],audit:['#e2e8f0','#94a3b8','#475569'],search:['#bfdbfe','#60a5fa','#2563eb'],money:['#bbf7d0','#22c55e','#166534'],queue:['#fed7aa','#fb923c','#c2410c'],beds:['#fbcfe8','#f472b6','#be185d']}
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
export default function Icon3D({name,size=28}:{name:IconName;size?:number}){const id='i'+name,[a,b,c]=C[name];return <svg className="appIcon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><defs>
 <linearGradient id={id} x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stopColor={a}/><stop offset=".55" stopColor={b}/><stop offset="1" stopColor={c}/></linearGradient>
 <radialGradient id={id+'g'} cx=".3" cy=".15" r=".9"><stop offset="0" stopColor="#fff" stopOpacity=".55"/><stop offset=".45" stopColor="#fff" stopOpacity=".08"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
 <linearGradient id={id+'r'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".9"/><stop offset=".5" stopColor="#fff" stopOpacity=".15"/><stop offset="1" stopColor="#fff" stopOpacity=".45"/></linearGradient>
 <filter id={id+'d'} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor={c} floodOpacity=".55"/></filter></defs>
 <path d={SQ} fill={`url(#${id})`}/><path d={SQ} fill={`url(#${id}g)`}/>
 <ellipse cx="32" cy="14" rx="22" ry="9" fill="#fff" opacity=".22"/>
 <path d={SQ} fill="none" stroke={`url(#${id}r)`} strokeWidth="1.4" opacity=".8"/>
 <g fill="#fff" fillOpacity=".96" filter={`url(#${id}d)`} transform="translate(32 33) scale(.82) translate(-32 -32)">{G[name]}</g></svg>}
