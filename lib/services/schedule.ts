/** Medicine reminder schedule from doctor's orders (pure, IST). "1-0-1" → morning + night; 4-part → morning/afternoon/evening/night.
 *  Before/after food shifts the slot time by the hospital's food offset. Dose count is preserved: if today's early slots have passed,
 *  the course runs into the next day so the patient still gets days × doses-per-day reminders. */
import {durationDays} from './normalize'
export type Slot='morning'|'afternoon'|'evening'|'night'
export type ReminderCfg={times:Partial<Record<Slot,string>>;foodOffsetMin:number}
export type RxLine={medicine:string;dose?:string|null;frequency?:string|null;duration?:string|null;instructions?:string|null}
export type Dose={at:Date;dateIST:string;slot:Slot;timeIST:string;timing:'before_food'|'after_food'|'any';medicines:{name:string;dose:string|null}[]}
const DEF:Record<Slot,string>={morning:'08:00',afternoon:'14:00',evening:'18:00',night:'21:00'}
const IST=330*60000
export function slotsFor(freq:string|null|undefined):Slot[]|null{if(!freq)return null;const f=String(freq).trim().toUpperCase();const map:Record<string,string>={OD:'1-0-0',BD:'1-0-1',TDS:'1-1-1',QID:'1-1-1-1',HS:'0-0-1'};const p=(map[f]||f).split('-');if(p.length<3||p.length>4||!p.every(x=>/^(\d+|½|1\/2)$/.test(x)))return null;const names:Slot[]=p.length===4?['morning','afternoon','evening','night']:['morning','afternoon','night'];const out=names.filter((_,i)=>p[i]!=='0');return out.length?out:null}
export function timingOf(instr:string|null|undefined):Dose['timing']{const s=String(instr||'').toLowerCase();if(/before\s*(food|meal|breakfast|lunch|dinner)|empty stomach|khali pet|khane se pehle/.test(s))return 'before_food';if(/after\s*(food|meal|breakfast|lunch|dinner)|with food|khane ke baad/.test(s))return 'after_food';return 'any'}
const hm=(s:string)=>{const m=String(s).match(/^(\d{1,2}):(\d{2})$/);if(!m)throw new Error('Bad time '+s);return +m[1]*60+ +m[2]}
const fmt=(min:number)=>`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`
/** UTC instant for an IST calendar date + minutes after midnight. */
export const istToUtc=(dateIST:string,minutes:number)=>new Date(Date.parse(dateIST+'T00:00:00Z')+minutes*60000-IST)
export const istDate=(d:Date)=>new Date(d.getTime()+IST).toISOString().slice(0,10)
export function medicineSchedule(lines:RxLine[],start:Date,cfg:ReminderCfg):Dose[]{const times={...DEF,...cfg.times};const groups=new Map<string,Dose>()
 for(const l of lines){const slots=slotsFor(l.frequency);const days=durationDays(l.duration);if(!slots||!days||!l.medicine)continue;const timing=timingOf(l.instructions);const shift=timing==='before_food'?-cfg.foodOffsetMin:timing==='after_food'?cfg.foodOffsetMin:0
  let need=slots.length*days;let day=istDate(start);let guard=0
  while(need>0&&guard++<400){for(const s of slots){if(!need)break;const min=hm(times[s])+shift;const at=istToUtc(day,min);if(at.getTime()<=start.getTime()+5*60000)continue;const key=`${day}|${s}|${timing}`;let g=groups.get(key);if(!g){g={at,dateIST:day,slot:s,timeIST:fmt(min),timing,medicines:[]};groups.set(key,g)}g.medicines.push({name:l.medicine,dose:l.dose||null});need--}
   day=new Date(Date.parse(day+'T00:00:00Z')+864e5).toISOString().slice(0,10)}}
 return [...groups.values()].sort((a,b)=>a.at.getTime()-b.at.getTime())}
