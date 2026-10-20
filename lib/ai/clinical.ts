/** Deterministic clinical helpers used by the AI assistant. These run in code (never by the LLM):
 *  lab value parsing + reference-range flags + trends, prescription safety checks, history aggregation, de-identified context. */
import {Db} from '../services/core'
import {scrub} from '../services/incidents'
import {slotsFor} from '../services/schedule'
export type Sex='M'|'F'|null
type Range={keys:RegExp;name:string;unit:string;lo?:number|{M:number;F:number};hi?:number|{M:number;F:number};scale?:(v:number,raw:string)=>number}
const R=(v:number|{M:number;F:number}|undefined,s:Sex)=>v==null?undefined:typeof v==='number'?v:s?v[s]:Math.min(v.M,v.F)
const RH=(v:number|{M:number;F:number}|undefined,s:Sex)=>v==null?undefined:typeof v==='number'?v:s?v[s]:Math.max(v.M,v.F)
export const RANGES:Range[]=[
 {keys:/\b(hb|haemoglobin|hemoglobin)\b/i,name:'Haemoglobin',unit:'g/dL',lo:{M:13,F:12},hi:{M:17,F:15.5}},
 {keys:/\b(tlc|wbc|total leu[ck]ocyte count|white cell count)\b/i,name:'Total leukocyte count',unit:'/µL',lo:4000,hi:11000,scale:v=>v<100?v*1000:v},
 {keys:/\b(platelets?|plt)\b/i,name:'Platelets',unit:'/µL',lo:150000,hi:450000,scale:(v,raw)=>/\bL\b|lakh/i.test(raw)||v<10?v*1e5:v<1000?v*1000:v},
 {keys:/\b(fbs|fasting (blood )?(sugar|glucose))\b/i,name:'Fasting glucose',unit:'mg/dL',lo:70,hi:100},
 {keys:/\b(rbs|random (blood )?(sugar|glucose))\b/i,name:'Random glucose',unit:'mg/dL',lo:70,hi:140},
 {keys:/\bhba1c\b/i,name:'HbA1c',unit:'%',lo:4,hi:5.6},
 {keys:/\b(s\.?\s*)?creatinine\b/i,name:'Creatinine',unit:'mg/dL',lo:{M:0.7,F:0.6},hi:{M:1.3,F:1.1}},
 {keys:/\b(blood )?urea\b/i,name:'Urea',unit:'mg/dL',lo:15,hi:40},
 {keys:/\b(sodium|na\+?)\b/i,name:'Sodium',unit:'mmol/L',lo:135,hi:145},
 {keys:/\b(potassium|k\+?)\b/i,name:'Potassium',unit:'mmol/L',lo:3.5,hi:5.1},
 {keys:/\btsh\b/i,name:'TSH',unit:'mIU/L',lo:0.4,hi:4.0},
 {keys:/\b(total )?bilirubin\b/i,name:'Bilirubin (total)',unit:'mg/dL',lo:0.3,hi:1.2},
 {keys:/\b(sgpt|alt)\b/i,name:'ALT (SGPT)',unit:'U/L',lo:7,hi:56},
 {keys:/\b(sgot|ast)\b/i,name:'AST (SGOT)',unit:'U/L',lo:10,hi:40},
 {keys:/\b(total )?cholesterol\b/i,name:'Total cholesterol',unit:'mg/dL',hi:200},
 {keys:/\btriglycerides?\b/i,name:'Triglycerides',unit:'mg/dL',hi:150},
 {keys:/\besr\b/i,name:'ESR',unit:'mm/hr',lo:0,hi:{M:15,F:20}},
 {keys:/\bcrp\b/i,name:'CRP',unit:'mg/L',hi:6}]
export type LabValue={name:string;value:number;unit:string;flag:'low'|'high'|'normal';range:string}
/** Pull analyte values out of free-text results ("Hb 9.8 g/dL; TLC 11,200/µL; Platelets 2.4 L/µL"). */
export function parseLab(text:string,sex:Sex):LabValue[]{const out:LabValue[]=[];const parts=String(text||'').split(/[;\n]|,(?!\d{3})/)
 for(const part of parts)for(const r of RANGES){const m=part.match(r.keys);if(!m)continue;const after=part.slice((m.index||0)+m[0].length);const n=after.match(/(-?\d[\d,]*\.?\d*)/);if(!n)continue;let v=Number(n[1].replace(/,/g,''));if(!Number.isFinite(v))continue;if(r.scale)v=r.scale(v,after);const lo=R(r.lo,sex),hi=RH(r.hi,sex)
  if(out.some(x=>x.name===r.name))continue;out.push({name:r.name,value:Math.round(v*100)/100,unit:r.unit,flag:lo!=null&&v<lo?'low':hi!=null&&v>hi?'high':'normal',range:`${lo??''}–${hi??''} ${r.unit}`});break}
 return out}
export function trends(cur:LabValue[],prev:LabValue[]){return cur.map(c=>{const p=prev.find(x=>x.name===c.name);if(!p)return {...c,trend:'new' as const,previous:null};const d=(c.value-p.value)/(Math.abs(p.value)||1);return {...c,trend:(Math.abs(d)<0.05?'stable':d>0?'up':'down') as 'stable'|'up'|'down',previous:p.value}})}
// ---------------- prescription safety ----------------
export const CLASSES:Record<string,string>={paracetamol:'paracetamol',acetaminophen:'paracetamol',dolo:'paracetamol',crocin:'paracetamol',calpol:'paracetamol',ibuprofen:'nsaid',diclofenac:'nsaid',aceclofenac:'nsaid',naproxen:'nsaid',aspirin:'nsaid',ketorolac:'nsaid',mefenamic:'nsaid',etoricoxib:'nsaid',amoxicillin:'penicillin',ampicillin:'penicillin','co-amoxiclav':'penicillin',augmentin:'penicillin',cloxacillin:'penicillin',azithromycin:'macrolide',clarithromycin:'macrolide',erythromycin:'macrolide',cephalexin:'cephalosporin',cefixime:'cephalosporin',ceftriaxone:'cephalosporin',cefuroxime:'cephalosporin',cefpodoxime:'cephalosporin',ciprofloxacin:'fluoroquinolone',levofloxacin:'fluoroquinolone',ofloxacin:'fluoroquinolone',moxifloxacin:'fluoroquinolone',pantoprazole:'ppi',omeprazole:'ppi',rabeprazole:'ppi',esomeprazole:'ppi',lansoprazole:'ppi',metformin:'biguanide',glimepiride:'sulfonylurea',gliclazide:'sulfonylurea',glibenclamide:'sulfonylurea',amlodipine:'ccb',nifedipine:'ccb',telmisartan:'arb',losartan:'arb',olmesartan:'arb',enalapril:'acei',ramipril:'acei',lisinopril:'acei',atorvastatin:'statin',rosuvastatin:'statin',simvastatin:'statin',warfarin:'anticoagulant',acenocoumarol:'anticoagulant',clopidogrel:'antiplatelet',cetirizine:'antihistamine',levocetirizine:'antihistamine',fexofenadine:'antihistamine',chlorpheniramine:'antihistamine',cotrimoxazole:'sulfa',sulfamethoxazole:'sulfa',metronidazole:'nitroimidazole',tinidazole:'nitroimidazole',tramadol:'opioid',codeine:'opioid',ondansetron:'setron',prednisolone:'steroid',dexamethasone:'steroid',methylprednisolone:'steroid'}
export const classOf=(drug:string)=>{const s=drug.toLowerCase();const k=Object.keys(CLASSES).find(k=>new RegExp('\\b'+k.replace('-','\\-')+'\\b').test(s));return k?{key:k,cls:CLASSES[k]}:null}
const ALLERGY_CLASS:Record<string,string[]>={penicillin:['penicillin'],amoxicillin:['penicillin'],sulfa:['sulfa'],sulpha:['sulfa'],sulfonamide:['sulfa'],nsaid:['nsaid'],aspirin:['nsaid'],ibuprofen:['nsaid'],diclofenac:['nsaid'],cephalosporin:['cephalosporin'],quinolone:['fluoroquinolone'],fluoroquinolone:['fluoroquinolone'],macrolide:['macrolide'],paracetamol:['paracetamol'],codeine:['opioid'],opioid:['opioid'],tramadol:['opioid']}
const INTERACTIONS:[string,string,string,'block'|'warn'][]=[['anticoagulant','nsaid','Bleeding risk: anticoagulant with NSAID','block'],['anticoagulant','macrolide','Macrolide raises INR with warfarin','warn'],['anticoagulant','fluoroquinolone','Fluoroquinolone raises INR with warfarin','warn'],['anticoagulant','nitroimidazole','Metronidazole markedly raises INR with warfarin','block'],['acei','arb','Dual RAAS blockade (ACE inhibitor + ARB)','block'],['nsaid','acei','NSAID with ACE inhibitor: kidney injury / reduced BP control','warn'],['nsaid','arb','NSAID with ARB: kidney injury / reduced BP control','warn'],['macrolide','statin','Myopathy risk (macrolide + statin)','warn'],['fluoroquinolone','steroid','Tendon rupture risk (fluoroquinolone + steroid)','warn'],['opioid','setron','Serotonin syndrome risk (tramadol + ondansetron)','warn'],['antiplatelet','ppi','Omeprazole/esomeprazole reduce clopidogrel effect (prefer pantoprazole)','warn'],['nsaid','steroid','GI bleeding risk (NSAID + steroid)','warn']]
type DoseRule={adultMaxDay?:number;childPerKgDose?:number;childPerKgDay?:number}
const DOSE:Record<string,DoseRule>={paracetamol:{adultMaxDay:4000,childPerKgDose:15,childPerKgDay:60},ibuprofen:{adultMaxDay:2400,childPerKgDose:10,childPerKgDay:40},amoxicillin:{adultMaxDay:3000,childPerKgDay:90},metformin:{adultMaxDay:2550},azithromycin:{adultMaxDay:500,childPerKgDay:10},cetirizine:{adultMaxDay:10},diclofenac:{adultMaxDay:150},tramadol:{adultMaxDay:400}}
export type RxLineIn={medicine:string;dose?:string|null;frequency?:string|null;duration?:string|null}
export type Warning={id:string;severity:'block'|'warn';message:string}
const mgOf=(s:string)=>{const m=String(s||'').match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg)\b/i);if(!m)return null;const v=Number(m[1]);return m[2].toLowerCase()==='g'?v*1000:m[2].toLowerCase()==='mcg'?v/1000:v}
const unitsOf=(dose:string)=>{const m=String(dose||'').match(/^(\d+(?:\.\d+)?|½|1\/2)\s*(tab|tablet|cap|capsule)/i);return m?(m[1]==='½'||m[1]==='1/2'?0.5:Number(m[1])):1}
export function safetyChecks(lines:RxLineIn[],ctx:{allergies:string|null;activeMeds:string[];ageYears:number|null;weightKg:number|null}):Warning[]{const w:Warning[]=[];const all=String(ctx.allergies||'').toLowerCase()
 const items=lines.filter(l=>l.medicine).map(l=>({l,c:classOf(l.medicine)}))
 for(const {l,c} of items){if(!c)continue
  for(const [term,classes] of Object.entries(ALLERGY_CLASS))if(new RegExp('\\b'+term).test(all)&&classes.includes(c.cls))w.push({id:`allergy:${c.key}`,severity:'block',message:`Allergy conflict: patient allergy "${term}" vs ${l.medicine} (${c.cls}).`})
  if(/penicillin|amoxicillin/.test(all)&&c.cls==='cephalosporin')w.push({id:`cross:${c.key}`,severity:'warn',message:`Penicillin allergy: possible cross-reactivity with ${l.medicine} (cephalosporin).`})
  if(new RegExp('\\b'+c.key).test(all))w.push({id:`allergy-name:${c.key}`,severity:'block',message:`Allergy conflict: patient is allergic to ${c.key}.`})}
 const classes=[...items.map(i=>i.c?.cls).filter(Boolean) as string[],...ctx.activeMeds.map(m=>classOf(m)?.cls).filter(Boolean) as string[]]
 const seen=new Map<string,number>();for(const c of classes)seen.set(c,(seen.get(c)||0)+1);for(const [c,n] of seen)if(n>1&&items.some(i=>i.c?.cls===c))w.push({id:`dup:${c}`,severity:'warn',message:`Duplicate therapy: more than one ${c} (including current medicines).`})
 const set=new Set(classes);const omep=[...lines.map(l=>l.medicine),...ctx.activeMeds].some(m=>/omeprazole|esomeprazole/i.test(m))
 for(const [a,b,msg,sev] of INTERACTIONS){if(a==='antiplatelet'&&b==='ppi'&&!omep)continue;if(set.has(a)&&set.has(b)&&items.some(i=>i.c&&[a,b].includes(i.c.cls)))w.push({id:`ddi:${a}+${b}`,severity:sev,message:msg})}
 for(const {l,c} of items){if(!c)continue;const rule=DOSE[c.key]||DOSE[c.cls];if(!rule)continue;const mg=mgOf(l.dose||'')??mgOf(l.medicine);const per=slotsFor(l.frequency)?.length||null;if(mg==null||!per)continue;const doseMg=mg*(mgOf(l.dose||'')!=null?1:unitsOf(l.dose||''));const day=doseMg*per
  const child=ctx.ageYears!=null&&ctx.ageYears<12
  if(child){if(!ctx.weightKg){w.push({id:`weight:${c.key}`,severity:'warn',message:`Child (${ctx.ageYears} y): record weight to check the ${l.medicine} dose.`});continue}if(rule.childPerKgDose&&doseMg>rule.childPerKgDose*ctx.weightKg*1.1)w.push({id:`dose:${c.key}`,severity:'block',message:`${l.medicine}: ${doseMg} mg per dose exceeds ${rule.childPerKgDose} mg/kg (${Math.round(rule.childPerKgDose*ctx.weightKg)} mg for ${ctx.weightKg} kg).`});if(rule.childPerKgDay&&day>rule.childPerKgDay*ctx.weightKg*1.1)w.push({id:`doseday:${c.key}`,severity:'block',message:`${l.medicine}: ${day} mg/day exceeds ${rule.childPerKgDay} mg/kg/day (${Math.round(rule.childPerKgDay*ctx.weightKg)} mg).`})}
  else if(rule.adultMaxDay&&day>rule.adultMaxDay)w.push({id:`doseday:${c.key}`,severity:'block',message:`${l.medicine}: ${day} mg/day exceeds the usual adult maximum of ${rule.adultMaxDay} mg/day.`})}
 return [...new Map(w.map(x=>[x.id,x])).values()]}
// ---------------- de-identified patient context ----------------
export const ageFrom=(dob:any)=>{if(!dob)return null;const d=new Date(dob);if(isNaN(d.getTime()))return null;return Math.floor((Date.now()-d.getTime())/(365.25*864e5))}
export async function patientContext(db:Db,hid:string,pid:string){const p=(await db.query('select gender,date_of_birth,allergies,blood_group from patients where id=$1 and hospital_id=$2',[pid,hid])).rows[0];if(!p)return null
 const sex:Sex=p.gender==='Male'?'M':p.gender==='Female'?'F':null
 const visits=(await db.query("select e.id,e.created_at,e.chief_complaint,e.examination,e.advice,e.follow_up_date,coalesce((select json_agg(json_build_object('code',d.icd10_code,'text',d.description)) from diagnoses d where d.encounter_id=e.id),'[]') dx from encounters e where e.patient_id=$1 and e.hospital_id=$2 order by e.created_at desc limit 10",[pid,hid])).rows
 const meds=(await db.query("select i.medicine_name,i.dose,i.frequency,i.duration,pr.created_at from prescription_items i join prescriptions pr on pr.id=i.prescription_id where pr.patient_id=$1 and pr.hospital_id=$2 and pr.created_at>now()-interval '90 days' order by pr.created_at desc",[pid,hid])).rows
 const vit=(await db.query('select temperature_c,pulse,bp_systolic,bp_diastolic,spo2,weight_kg,height_cm,recorded_at from vitals where patient_id=$1 and hospital_id=$2 order by recorded_at desc limit 3',[pid,hid])).rows
 const labs=(await db.query("select id,test_name,category,result_text,resulted_at from diagnostic_orders where patient_id=$1 and hospital_id=$2 and status='completed' order by resulted_at desc limit 20",[pid,hid])).rows
 const weight=vit.find((v:any)=>v.weight_kg)?.weight_kg;const active=meds.filter((m:any)=>{const d=Number(String(m.duration||'').match(/\d+/)?.[0]||0);return Date.now()-new Date(m.created_at).getTime()<=(d||30)*864e5}).map((m:any)=>m.medicine_name)
 return {sex,ageYears:ageFrom(p.date_of_birth),allergies:p.allergies?scrub(p.allergies,200):null,bloodGroup:p.blood_group||null,weightKg:weight?Number(weight):null,
  visits:visits.map((v:any)=>({date:String(v.created_at instanceof Date?v.created_at.toISOString():v.created_at).slice(0,10),complaint:v.chief_complaint?scrub(v.chief_complaint,200):null,findings:v.examination?scrub(v.examination,200):null,advice:v.advice?scrub(v.advice,200):null,diagnoses:v.dx})),
  meds:meds.map((m:any)=>({name:m.medicine_name,dose:m.dose,frequency:m.frequency,duration:m.duration,date:String(m.created_at instanceof Date?m.created_at.toISOString():m.created_at).slice(0,10)})),activeMeds:[...new Set(active)] as string[],vitals:vit,
  labs:labs.map((l:any)=>({id:l.id,test:l.test_name,category:l.category,result:scrub(l.result_text,400),date:String(l.resulted_at instanceof Date?l.resulted_at.toISOString():l.resulted_at).slice(0,10)}))}}
/** Deterministic history card (works without any LLM). */
export function historyCard(c:NonNullable<Awaited<ReturnType<typeof patientContext>>>){const dx=new Map<string,{code:string|null;text:string;count:number;last:string}>()
 for(const v of c.visits)for(const d of v.diagnoses as any[]){const k=(d.code||d.text||'').toUpperCase();const x=dx.get(k);if(x){x.count++}else dx.set(k,{code:d.code,text:d.text,count:1,last:v.date})}
 const diagnoses=[...dx.values()],v:any=c.vitals[0]||null
 const lines=[`${c.ageYears??'?'} y ${c.sex||''} · Allergies: ${c.allergies||'None recorded'}`,`${c.visits.length} visit(s)${c.visits[0]?' · last '+c.visits[0].date:''}`,...diagnoses.slice(0,6).map(d=>`${d.code?d.code+' ':''}${d.text||''}${d.count>1?' ×'+d.count:''} (last ${d.last})`),c.activeMeds.length?'Active medicines: '+c.activeMeds.join(', '):'No active medicines',...(v?[`Latest vitals: ${Object.entries(v).filter(([k,x])=>x!=null&&k!=='date'&&k!=='recorded_at').map(([k,x])=>k+' '+x).join(', ')}`]:[])]
 return {age:c.ageYears,sex:c.sex,allergies:c.allergies||'None recorded',visits:c.visits.length,lastVisit:c.visits[0]?.date||null,diagnoses,activeMeds:c.activeMeds,latestVitals:v,lines}}
const PII=/^(full_?name|name|patient_?name|phone|mobile|alt_?phone|address|abha.*|email|aadhaar.*|guardian.*|emergency.*|kin.*|contact.*)$/i
/** Recursively drop identifier fields and scrub free text before anything leaves for an LLM. */
export function deidentify(v:any):any{if(Array.isArray(v))return v.map(deidentify);if(v&&typeof v==='object'){const o:any={};for(const [k,x] of Object.entries(v))if(!PII.test(k))o[k]=deidentify(x);return o}return typeof v==='string'?scrub(v,600):v}
