/** Shift coverage: how many people of each role cover each Morning / Evening / Night slot, from the weekly roster and leave.
 *  Pure functions over roster() output, so the roster agent, the staff brief and tests share one rule set. */
export type Slot='Morning'|'Evening'|'Night'
export const SLOTS:Record<Slot,[number,number]>={Morning:[8*60,14*60],Evening:[14*60,20*60],Night:[20*60,32*60]}
export const SLOT_TIMES:Record<Slot,[string,string]>={Morning:['08:00','14:00'],Evening:['14:00','20:00'],Night:['20:00','08:00']}
export type Cover=Record<string,Partial<Record<Slot,number>>>
/** Minimum people per slot, applied only to roles the hospital actually has. Doctors are left out: their OPD hours are not shift cover. */
export const DEFAULT_COVER:Cover={nurse:{Morning:1,Evening:1,Night:1},reception:{Morning:1,Evening:1},pharmacy:{Morning:1,Evening:1},lab:{Morning:1},billing:{Morning:1}}
export const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const hm=(s:string)=>{const m=String(s||'').match(/^(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:0}
type Sh={day:number;start:string;end:string;shift?:string|null}
/** Shift as absolute minutes in the week (Sunday 00:00 = 0); overnight shifts run past midnight. */
const span=(s:Sh):[number,number]=>{const a=hm(s.start),b=hm(s.end);return [s.day*1440+a,s.day*1440+(b<=a?b+1440:b)]}
const W=7*1440
/** Minutes of shift s inside slot `slot` on weekday `day` (wrapping Saturday night into Sunday). */
export function overlap(s:Sh,day:number,slot:Slot){const [a,b]=span(s),[x,y]=SLOTS[slot];const sa=day*1440+x,sb=day*1440+y;let best=0;for(const k of [-W,0,W]){best=Math.max(best,Math.min(b+k,sb)-Math.max(a+k,sa))}return Math.max(0,best)}
/** A person covers a slot when at least half of it is inside one of their shifts. */
export const covers=(shifts:Sh[],day:number,slot:Slot)=>shifts.some(s=>overlap(s,day,slot)*2>=SLOTS[slot][1]-SLOTS[slot][0])
export const weekMinutes=(shifts:Sh[])=>shifts.reduce((t,s)=>{const [a,b]=span(s);return t+(b-a)},0)
export const nights=(shifts:Sh[])=>[0,1,2,3,4,5,6].filter(d=>covers(shifts,d,'Night')).length
export function mergedCover(custom:any):Cover{const out:Cover={};for(const [r,v] of Object.entries(DEFAULT_COVER))out[r]={...v};if(custom&&typeof custom==='object')for(const [r,v] of Object.entries(custom)){if(!v||typeof v!=='object')continue;out[r]={};for(const s of Object.keys(SLOTS) as Slot[]){const n=Number((v as any)[s]);if(Number.isInteger(n)&&n>0&&n<=50)out[r][s]=n}}return out}
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400e3).toISOString().slice(0,10)
const dow=(d:string)=>new Date(d+'T00:00:00Z').getUTCDay()
const IST=330*60000
/** Slot window as UTC dates for an IST calendar date. */
function slotUtc(date:string,slot:Slot):[Date,Date]{const base=Date.parse(date+'T00:00:00Z')-IST;const [x,y]=SLOTS[slot];return [new Date(base+x*60000),new Date(base+y*60000)]}
const onLeave=(leaves:any[],date:string,slot:Slot)=>{const [a,b]=slotUtc(date,slot);return leaves.some(l=>new Date(l.start_at)<b&&new Date(l.end_at)>a)}
export type Gap={role:string;date:string|null;day:number;slot:Slot;need:number;have:number;away:string[];canCover:{id:string;name:string}[]}
/** Coverage for each role/slot: pattern gaps (the weekly roster itself is short) and dated gaps over `days` from `from` (leave). */
export function coverage(staff:any[],cover:Cover,from:string,days=7){const roles=new Map<string,any[]>();for(const s of staff){if(s.role==='admin'||s.role==='doctor')continue;roles.set(s.role,[...(roles.get(s.role)||[]),s])}
 const pattern:Gap[]=[],dated:Gap[]=[]
 for(const [role,people] of roles){const need=cover[role];if(!need)continue
  for(const slot of Object.keys(SLOTS) as Slot[]){const n=need[slot];if(!n)continue
   for(let d=0;d<7;d++){const on=people.filter(p=>covers(p.shifts||[],d,slot));if(on.length<n){const free=people.filter(p=>!on.includes(p)&&!(p.shifts||[]).some((s:Sh)=>s.day===d)).sort((a,b)=>weekMinutes(a.shifts||[])-weekMinutes(b.shifts||[]));pattern.push({role,date:null,day:d,slot,need:n,have:on.length,away:[],canCover:free.slice(0,3).map(p=>({id:p.id,name:p.full_name}))})}}
   for(let i=0;i<days;i++){const date=addDays(from,i),d=dow(date);const on=people.filter(p=>covers(p.shifts||[],d,slot));if(on.length<n)continue;const away=on.filter(p=>onLeave(p.leaves||[],date,slot));if(on.length-away.length>=n)continue
    const free=people.filter(p=>!on.includes(p)&&!onLeave(p.leaves||[],date,slot)&&!(p.shifts||[]).some((s:Sh)=>s.day===d)).sort((a,b)=>weekMinutes(a.shifts||[])-weekMinutes(b.shifts||[]))
    dated.push({role,date,day:d,slot,need:n,have:on.length-away.length,away:away.map(p=>p.full_name),canCover:free.slice(0,3).map(p=>({id:p.id,name:p.full_name}))})}}}
 return {pattern,dated}}
