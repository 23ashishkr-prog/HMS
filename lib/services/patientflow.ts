/** Patient flow (admin): how long patients wait at each department, from registration through doctor, lab,
 *  pharmacy and billing to discharge, over a date range, plus who is waiting right now. Minutes unless noted. */
import {Ctx,Db,HttpError} from './core'
import {istDate,istToUtc} from './doctorsched'
const M=(a:string,b:string)=>`extract(epoch from (${b})-(${a}))/60`
const stats=(a:string,b:string,where=`${b} is not null`)=>`count(*) filter(where ${where})::int n_${b.replace(/\W/g,'')},round(avg(${M(a,b)}) filter(where ${where})::numeric,1)::float avg_${b.replace(/\W/g,'')},round((percentile_cont(0.5) within group(order by ${M(a,b)}) filter(where ${where}))::numeric,1)::float med_${b.replace(/\W/g,'')},round(max(${M(a,b)}) filter(where ${where})::numeric,1)::float max_${b.replace(/\W/g,'')}`
const pick=(r:any,k:string)=>({n:r['n_'+k]||0,avg:r['avg_'+k],median:r['med_'+k],max:r['max_'+k]})
export async function patientFlow(db:Db,ctx:Ctx,o:{from?:string;to?:string;now?:Date}={}){if(ctx.role!=='admin')throw new HttpError(403,'Only an admin can see patient flow.');const now=o.now||new Date();const today=istDate(now)
 const from=o.from||today,to=o.to||today;if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new HttpError(400,'Pick a valid date range.')
 const a=istToUtc(from,0),b=istToUtc(to,1440),h=ctx.hospitalId,P=[h,a,b]
 // Doctors' departments: wait to be called, time with the doctor
 const opd=(await db.query(`select coalesce(nullif(u.department,''),'General') dept,count(*)::int visits,count(distinct q.doctor_user_id)::int doctors,${stats('q.checked_in_at','q.called_at')},${stats('q.called_at','q.completed_at','q.completed_at is not null and q.called_at is not null')}
  from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.checked_in_at>=$2 and q.checked_in_at<$3 group by 1 order by visits desc`,P)).rows
  .map((r:any)=>({dept:r.dept,visits:r.visits,doctors:r.doctors,wait:pick(r,'qcalled_at'),consult:pick(r,'qcompleted_at')}))
 const nowQ=(await db.query(`select coalesce(nullif(u.department,''),'General') dept,count(*) filter(where q.status='waiting')::int waiting,count(*) filter(where q.status='consultation')::int in_consult,round(max(${M('q.checked_in_at','now()')}) filter(where q.status='waiting')::numeric)::int longest
  from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.status in ('waiting','consultation') and q.checked_in_at>now()-interval '18 hours' group by 1`,[h])).rows
 const nowBy=new Map(nowQ.map((r:any)=>[r.dept,r]));const depts=[...new Set([...opd.map((d:any)=>d.dept),...nowQ.map((d:any)=>d.dept)])]
 const departments=depts.map(d=>({...(opd.find((x:any)=>x.dept===d)||{dept:d,visits:0,doctors:0,wait:{n:0},consult:{n:0}}),now:nowBy.get(d)||{waiting:0,in_consult:0,longest:null}}))
 // Service departments
 const dx=(await db.query(`select category,count(*)::int orders,${stats('ordered_at','sample_collected_at')},${stats('ordered_at','resulted_at')} from diagnostic_orders where hospital_id=$1 and ordered_at>=$2 and ordered_at<$3 and status<>'cancelled' group by 1`,P)).rows
 const dxNow=(await db.query(`select category,count(*)::int pending,round(max(${M('ordered_at','now()')})::numeric)::int oldest from diagnostic_orders where hospital_id=$1 and status in ('ordered','sample_collected') and ordered_at>now()-interval '7 days' group by 1`,[h])).rows
 const rx=(await db.query(`select count(*)::int rx,${stats('created_at','dispensed_at')} from prescriptions where hospital_id=$1 and created_at>=$2 and created_at<$3`,P)).rows[0]
 const rxNow=(await db.query(`select count(*)::int pending,round(max(${M('created_at','now()')})::numeric)::int oldest from prescriptions where hospital_id=$1 and status='pending' and created_at>now()-interval '18 hours'`,[h])).rows[0]
 const bill=(await db.query(`select count(*)::int bills,${stats('i.created_at','fp.at')} from invoices i left join lateral (select min(received_at) at from payments where invoice_id=i.id) fp on true where i.hospital_id=$1 and i.created_at>=$2 and i.created_at<$3 and i.status<>'cancelled'`,P)).rows[0]
 const billNow=(await db.query(`select count(*)::int open from invoices where hospital_id=$1 and status in ('open','partially_paid') and created_at>now()-interval '18 hours'`,[h])).rows[0]
 const ipd=(await db.query(`select (select count(*)::int from admissions where hospital_id=$1 and admitted_at>=$2 and admitted_at<$3) admitted,(select count(*)::int from admissions where hospital_id=$1 and discharged_at>=$2 and discharged_at<$3) discharged,
  (select round(avg(extract(epoch from discharged_at-admitted_at)/3600)::numeric,1)::float from admissions where hospital_id=$1 and discharged_at>=$2 and discharged_at<$3) avg_stay_h,(select count(*)::int from admissions where hospital_id=$1 and status='admitted') in_beds`,P)).rows[0]
 const d=(c:string)=>{const r=dx.find((x:any)=>x.category===c)||{};const n=dxNow.find((x:any)=>x.category===c)||{};return {orders:r.orders||0,toSample:pick(r,'sample_collected_at'),turnaround:pick(r,'resulted_at'),pending:n.pending||0,oldest:n.oldest??null}}
 const services={lab:d('lab'),radiology:d('radiology'),pharmacy:{prescriptions:rx.rx,toDispense:pick(rx,'dispensed_at'),pending:rxNow.pending,oldest:rxNow.oldest},billing:{bills:bill.bills,toFirstPayment:pick(bill,'fpat'),open:billNow.open},ipd}
 // A visit's journey: registration (new patients) -> check-in -> called -> consult done -> medicines dispensed / bill paid
 const j=(await db.query(`with v as (select q.id,q.checked_in_at,q.called_at,q.completed_at,p.created_at reg,
   (select min(rx.dispensed_at) from prescriptions rx join encounters e on e.id=rx.encounter_id where e.queue_id=q.id) dispensed,
   (select min(pm.received_at) from invoice_items ii join payments pm on pm.invoice_id=ii.invoice_id where ii.source_type='visit' and ii.source_id=q.id) paid
  from doctor_queue q join patients p on p.id=q.patient_id where q.hospital_id=$1 and q.checked_in_at>=$2 and q.checked_in_at<$3)
  select count(*)::int visits,${stats('reg','checked_in_at',"reg>=checked_in_at-interval '12 hours' and reg<=checked_in_at")},${stats('checked_in_at','called_at')},${stats('called_at','completed_at','completed_at is not null and called_at is not null')},${stats('completed_at','dispensed','dispensed is not null and completed_at is not null and dispensed>=completed_at')},${stats('checked_in_at','paid','paid is not null')},
   ${stats('checked_in_at','greatest(completed_at,dispensed,paid)','completed_at is not null')} from v`,P)).rows[0]
 const journey=[{stage:'Registration → check-in (new patients)',...pick(j,'checked_in_at')},{stage:'Check-in → called by doctor',...pick(j,'called_at')},{stage:'With the doctor',...pick(j,'completed_at')},{stage:'Consult done → medicines given',...pick(j,'dispensed')},{stage:'Check-in → bill paid',...pick(j,'paid')},{stage:'Check-in → all done (OPD visit)',...pick(j,'greatestcompleted_atdispensedpaid')}]
 return {from,to,visits:j.visits,departments,services,journey,generatedAt:now}}
