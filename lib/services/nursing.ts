/** Inpatient nursing: doctors order medicines for the stay, nurses chart each dose (eMAR), record vitals and intake/output,
 *  and write nursing notes; doctors write round notes. Dose times are IST. */
import {Ctx,Db,HttpError,audit,num,opt,required,requireRole} from './core';import {istDate,istToUtc} from './doctorsched'
const WARD=['admin','doctor','nurse'] as const
const IST=330*60000
/** Default dose times for common frequencies. SOS (as needed) has no schedule; STAT is one dose now. */
export const FREQ:Record<string,string[]>={OD:['09:00'],BD:['09:00','21:00'],TDS:['08:00','14:00','20:00'],QID:['06:00','12:00','18:00','23:00'],Q6H:['00:00','06:00','12:00','18:00'],Q8H:['06:00','14:00','22:00'],HS:['21:00'],SOS:[],STAT:[]}
const hhmm=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
async function stay(db:Db,ctx:Ctx,admissionId:string,needOpen=true){const a=(await db.query('select a.*,p.full_name,p.uhid,b.ward,b.bed_no,u.full_name doctor from admissions a join patients p on p.id=a.patient_id join beds b on b.id=a.bed_id join users u on u.id=a.admitting_doctor_id where a.id=$1 and a.hospital_id=$2',[admissionId,ctx.hospitalId])).rows[0];if(!a)throw new HttpError(404,'Admission not found.');if(needOpen&&a.status!=='admitted')throw new HttpError(409,'The patient is already discharged.');return a}

export async function addMedOrder(db:Db,ctx:Ctx,admissionId:string,b:any){requireRole(ctx,['admin','doctor']);const a=await stay(db,ctx,admissionId)
 const freq=String(b.frequency||'').toUpperCase().trim()||'OD';let times:string[]=Array.isArray(b.times)?b.times:String(b.times||'').split(/[ ,]+/).filter(Boolean);times=times.filter(hhmm);if(!times.length)times=FREQ[freq]??[]
 const today=istDate(new Date());const starts=/^\d{4}-\d{2}-\d{2}$/.test(b.startsOn||'')?b.startsOn:today;const days=num(b.days,'Days');const ends=/^\d{4}-\d{2}-\d{2}$/.test(b.endsOn||'')?b.endsOn:days?istDate(new Date(Date.parse(starts+'T12:00:00Z')+(days-1)*86400e3)):null
 const r=(await db.query('insert into ipd_med_orders(hospital_id,admission_id,medicine_name,dose,route,frequency,times,instructions,starts_on,ends_on,ordered_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *',[ctx.hospitalId,a.id,required(b.medicine,'Medicine'),opt(b.dose),opt(b.route),freq,times.sort(),opt(b.instructions),starts,ends,ctx.userId])).rows[0]

 await audit(db,ctx,'med_order','ipd_med_order',r.id,{medicine:r.medicine_name,frequency:freq});return r}
export async function stopMedOrder(db:Db,ctx:Ctx,orderId:string,b:any={}){requireRole(ctx,['admin','doctor']);const r=(await db.query("update ipd_med_orders set status='stopped',stopped_by=$3,stopped_at=now(),stop_reason=$4 where id=$1 and hospital_id=$2 and status='active' returning *",[orderId,ctx.hospitalId,ctx.userId,opt(b.reason)])).rows[0];if(!r)throw new HttpError(404,'Active order not found.');await audit(db,ctx,'med_stop','ipd_med_order',r.id);return r}

/** The day's medication chart: every scheduled dose of every order, with what was recorded. STAT orders get one dose at the order time. */
export async function mar(db:Db,ctx:Ctx,admissionId:string,dateIST=istDate(new Date()),now=new Date()){requireRole(ctx,[...WARD]);const a=await stay(db,ctx,admissionId,false)
 const orders=(await db.query(`select o.*,to_char(o.starts_on,'YYYY-MM-DD') s_on,to_char(o.ends_on,'YYYY-MM-DD') e_on,u.full_name ordered_by_name from ipd_med_orders o left join users u on u.id=o.ordered_by where o.admission_id=$1 and o.hospital_id=$2 order by o.status,o.ordered_at`,[a.id,ctx.hospitalId])).rows
 const from=istToUtc(dateIST,0),to=istToUtc(dateIST,1440)
 const doses=(await db.query('select d.*,u.full_name recorded_by_name from ipd_med_doses d left join users u on u.id=d.recorded_by where d.admission_id=$1 and d.scheduled_at>=$2 and d.scheduled_at<$3',[a.id,from,to])).rows
 const rows=orders.map((o:any)=>{const live=o.s_on<=dateIST&&(!o.e_on||o.e_on>=dateIST)&&(o.status==='active'||new Date(o.stopped_at)>from)
  let slots:Date[]=o.frequency==='STAT'?(istDate(new Date(o.ordered_at))===dateIST?[new Date(Math.floor(new Date(o.ordered_at).getTime()/60000)*60000)]:[]):live?o.times.map((t:string)=>istToUtc(dateIST,+t.slice(0,2)*60+ +t.slice(3,5))):[]
  if(o.status==='stopped')slots=slots.filter(s=>s<new Date(o.stopped_at))
  const mine=doses.filter((d:any)=>d.order_id===o.id)
  const sched=slots.map(s=>{const d=mine.find((x:any)=>new Date(x.scheduled_at).getTime()===s.getTime());const late=now.getTime()-s.getTime()
   return {at:s.toISOString(),time:new Date(s.getTime()+IST).toISOString().slice(11,16),status:d?.status||(late>60*60000?'overdue':late>=-30*60000?'due':'upcoming'),note:d?.note||null,by:d?.recorded_by_name||null,recordedAt:d?.recorded_at||null}})
  const extra=mine.filter((d:any)=>!slots.some(s=>s.getTime()===new Date(d.scheduled_at).getTime())).map((d:any)=>({at:new Date(d.scheduled_at).toISOString(),time:new Date(new Date(d.scheduled_at).getTime()+IST).toISOString().slice(11,16),status:d.status,note:d.note,by:d.recorded_by_name,recordedAt:d.recorded_at,asNeeded:true}))
  return {id:o.id,medicine:o.medicine_name,dose:o.dose,route:o.route,frequency:o.frequency,times:o.times,instructions:o.instructions,startsOn:o.s_on,endsOn:o.e_on,status:o.status,orderedBy:o.ordered_by_name,stopReason:o.stop_reason,doses:[...sched,...extra].sort((x,y)=>x.at.localeCompare(y.at))}})
 return {date:dateIST,orders:rows,due:rows.reduce((n:number,o:any)=>n+o.doses.filter((d:any)=>d.status==='due').length,0),overdue:rows.reduce((n:number,o:any)=>n+o.doses.filter((d:any)=>d.status==='overdue').length,0)}}

/** Nurse charts a dose. A scheduled time must belong to the order; with no time (SOS / extra dose) it is recorded now. */
export async function recordDose(db:Db,ctx:Ctx,orderId:string,b:any){requireRole(ctx,[...WARD]);const o=(await db.query('select * from ipd_med_orders where id=$1 and hospital_id=$2',[orderId,ctx.hospitalId])).rows[0];if(!o)throw new HttpError(404,'Medicine order not found.');await stay(db,ctx,o.admission_id)
 const status=['given','held','refused','missed'].includes(b.status)?b.status:'given';if(status!=='given'&&!opt(b.note))throw new HttpError(400,'Write why the dose was '+status+'.')
 let at:Date;if(b.at){at=new Date(b.at);if(isNaN(at.getTime()))throw new HttpError(400,'Bad dose time.');const t=new Date(at.getTime()+IST).toISOString().slice(11,16);if(o.frequency!=='STAT'&&!o.times.includes(t))throw new HttpError(400,'That time is not on this order.')}else{if(o.status!=='active')throw new HttpError(409,'This order was stopped.');at=new Date(Math.floor(Date.now()/60000)*60000)}
 const r=(await db.query('insert into ipd_med_doses(hospital_id,order_id,admission_id,scheduled_at,status,note,recorded_by) values($1,$2,$3,$4,$5,$6,$7) on conflict(order_id,scheduled_at) do update set status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by,recorded_at=now() returning *',[ctx.hospitalId,o.id,o.admission_id,at,status,opt(b.note),ctx.userId])).rows[0]
 await audit(db,ctx,'dose_'+status,'ipd_med_dose',r.id,{medicine:o.medicine_name});return r}

const VITAL_KEYS:[string,string,number,number][]=[['bpSys','BP systolic',40,300],['bpDia','BP diastolic',20,200],['pulse','Pulse',20,250],['tempF','Temperature °F',90,110],['spo2','SpO₂',40,100],['resp','Respiration',4,80],['pain','Pain (0–10)',0,10],['sugar','Blood sugar',20,800]]
/** Bedside chart entry: vitals, or one intake / output with its volume in ml. */
export async function addChart(db:Db,ctx:Ctx,admissionId:string,b:any){requireRole(ctx,[...WARD]);const a=await stay(db,ctx,admissionId);const kind=b.kind;let data:any={}
 if(kind==='vitals'){for(const [k,l,lo,hi] of VITAL_KEYS){const v=num(b[k],l);if(v==null)continue;if(v<lo||v>hi)throw new HttpError(400,`${l} ${v} looks wrong (expected ${lo}–${hi}).`);data[k]=v}if(!Object.keys(data).length)throw new HttpError(400,'Enter at least one vital sign.')}
 else if(kind==='intake'||kind==='output'){const ml=num(b.volumeMl,'Volume (ml)');if(ml==null||ml<=0||ml>10000)throw new HttpError(400,'Enter the volume in ml.');data={volumeMl:ml,type:opt(b.type)||(kind==='intake'?'oral':'urine'),item:opt(b.item)}}
 else throw new HttpError(400,'Unknown chart.')
 const at=b.at?new Date(b.at):new Date();if(isNaN(at.getTime())||at.getTime()>Date.now()+5*60000)throw new HttpError(400,'Bad time.')
 const r=(await db.query('insert into ipd_charts(hospital_id,admission_id,kind,recorded_at,data,note,recorded_by) values($1,$2,$3,$4,$5,$6,$7) returning *',[ctx.hospitalId,a.id,kind,at,JSON.stringify(data),opt(b.note),ctx.userId])).rows[0];return r}
export async function addNote(db:Db,ctx:Ctx,admissionId:string,b:any){const kind=b.kind==='round'?'round':'nursing';requireRole(ctx,kind==='round'?['admin','doctor']:[...WARD]);const a=await stay(db,ctx,admissionId)
 const r=(await db.query('insert into ipd_notes(hospital_id,admission_id,kind,text,plan,created_by) values($1,$2,$3,$4,$5,$6) returning *',[ctx.hospitalId,a.id,kind,required(b.text,kind==='round'?'Findings':'Note'),opt(b.plan),ctx.userId])).rows[0];await audit(db,ctx,kind==='round'?'doctor_round':'nursing_note','ipd_note',r.id);return r}

/** One patient's ward chart: today's medicines, recent vitals, 24-hour intake/output balance and notes. */
export async function wardChart(db:Db,ctx:Ctx,admissionId:string,now=new Date()){requireRole(ctx,[...WARD]);const a=await stay(db,ctx,admissionId,false)
 const [charts,notes]=await Promise.all([db.query('select c.*,u.full_name by_name from ipd_charts c left join users u on u.id=c.recorded_by where c.admission_id=$1 and c.recorded_at>=$2 order by c.recorded_at desc limit 300',[a.id,new Date(now.getTime()-7*86400e3)]),db.query('select n.*,u.full_name by_name,u.role by_role from ipd_notes n left join users u on u.id=n.created_by where n.admission_id=$1 order by n.created_at desc limit 100',[a.id])])
 const since=now.getTime()-86400e3,io=charts.rows.filter((c:any)=>c.kind!=='vitals'&&new Date(c.recorded_at).getTime()>=since);const sum=(k:string)=>io.filter((c:any)=>c.kind===k).reduce((s:number,c:any)=>s+Number(c.data.volumeMl||0),0)
 const intake=sum('intake'),output=sum('output')
 return {admission:{id:a.id,no:a.admission_no,status:a.status,patient:a.full_name,uhid:a.uhid,patientId:a.patient_id,ward:a.ward,bed:a.bed_no,doctor:a.doctor,admittedAt:a.admitted_at,reason:a.reason},
  mar:await mar(db,ctx,a.id,istDate(now),now),vitals:charts.rows.filter((c:any)=>c.kind==='vitals'),io:charts.rows.filter((c:any)=>c.kind!=='vitals'),balance24h:{intake,output,net:intake-output},notes:notes.rows,vitalFields:VITAL_KEYS.map(([k,l])=>({key:k,label:l}))}}

/** Doses due or overdue now, per admitted patient (the ward's to-do list on the bed board). */
export async function wardDue(db:Db,ctx:Ctx,now=new Date()){requireRole(ctx,['admin','doctor','nurse','reception','billing']);const ids=(await db.query("select id from admissions where hospital_id=$1 and status='admitted'",[ctx.hospitalId])).rows.map((r:any)=>r.id)
 const out:Record<string,{due:number;overdue:number}>={};for(const id of ids){const m=await mar(db,{...ctx,role:'nurse'},id,istDate(now),now);if(m.due||m.overdue)out[id]={due:m.due,overdue:m.overdue}}return out}
