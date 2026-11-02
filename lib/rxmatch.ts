/** Prescription ↔ pharmacy stock helpers, shared by the pharmacy screen and the dispense API.
 *  medKey: the drug's generic name without strength/form ("Amlodipine 5mg tablet" → "amlodipine"). */
const FORM=/\b(tab(let)?s?|cap(sule)?s?|syrup|susp(ension)?|inj(ection)?|drops?|cream|ointment|gel|sachet|powder|inhaler|spray|solution|liquid)\b/g
export const medKey=(name:string)=>String(name||'').toLowerCase().replace(/\(.*?\)/g,' ').replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%)(\/\d+\s*ml)?/g,' ').replace(FORM,' ').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim()
const strengthOf=(s:string)=>(String(s||'').toLowerCase().match(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu)/)||[''])[0].replace(/\s+/g,'')
/** True when the stock medicine is the prescribed drug (same generic name; strength must match when both state one). */
export function sameDrug(prescribed:string,stockName:string,stockStrength?:string|null){const a=medKey(prescribed),b=medKey(stockName);if(!a||!b)return false;if(a!==b&&!a.startsWith(b+' ')&&!b.startsWith(a+' '))return false;const sa=strengthOf(prescribed),sb=strengthOf((stockStrength||'')+' '+stockName);return !sa||!sb||sa===sb}
/** Best stock row for a prescription line, or null. */
export function matchStock<T extends {name:string;strength?:string|null;in_stock?:number}>(prescribed:string,stock:T[]):T|null{const hits=stock.filter(m=>sameDrug(prescribed,m.name,m.strength));return hits.sort((x,y)=>(y.in_stock||0)-(x.in_stock||0))[0]||null}
const PER_DAY:Record<string,number>={od:1,hs:1,qd:1,daily:1,bd:2,bid:2,tds:3,tid:3,qid:4,qds:4}
/** Units to dispense = units per dose × doses per day × days. Null when it cannot be worked out (syrups, SOS, missing days). */
export function rxQuantity(dose?:string|null,frequency?:string|null,duration?:string|null):number|null{
 const d=String(dose||'').trim().toLowerCase();if(/\bml\b/.test(d))return null
 const unit=d.match(/^(\d+(\.\d+)?|½|1\/2)\s*(tab|tablet|cap|capsule|sachet|puff|drop)?/);const per=unit?(unit[1]==='½'||unit[1]==='1/2'?0.5:Number(unit[1])):1
 const f=String(frequency||'').trim().toLowerCase();let day:number|null=null
 if(/^\d+(\.\d+)?(-\d+(\.\d+)?){2,3}$/.test(f))day=f.split('-').reduce((s,x)=>s+Number(x),0);else if(PER_DAY[f.replace(/[^a-z]/g,'')])day=PER_DAY[f.replace(/[^a-z]/g,'')]
 const m=String(duration||'').toLowerCase().match(/(\d+)\s*(d|day|days|w|wk|week|weeks|m|month|months)?\b/);if(!day||!m)return null
 const n=Number(m[1])*(/^w/.test(m[2]||'')?7:/^m/.test(m[2]||'')?30:1);const q=Math.ceil(per*day*n);return q>0&&q<10000?q:null}
