/** Patient flow (admin): patient VOLUME per department for a period, compared with the period before, staff load
 *  (patients per doctor / per staff member a day, beds per nurse), and suggested actions for adding people or fixing
 *  a department. No waiting times: only counts the system records anyway (registrations, visits, orders, bills). */
import {Ctx,Db,HttpError} from './core'
import {istDate,istToUtc} from './doctorsched'
const DEPT=`coalesce(nullif(trim(u.department),''),'General')`
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400e3).toISOString().slice(0,10)
const r1=(n:number)=>Math.round(n*10)/10
const pct=(a:number,b:number)=>b?Math.round(100*(a-b)/b):null
/** Thresholds behind the suggested actions (Indian OPD/IPD rules of thumb). */
export const KPI={busyDoctor:35,quietDoctor:8,bedsPerNurse:6,highOccupancy:85,lowOccupancy:40,labPerStaff:60,deskPerStaff:80,pharmacyFill:70,noShow:20,trend:25}
type Act={level:'add'|'improve'|'watch'|'info';area:string;text:string;why:string}

async function window_(db:Db,h:string,a:Date,b:Date){const P=[h,a,b]
 const q=async(sql:string,p:any[]=P)=>(await db.query(sql,p)).rows
 const depts=await q(`select ${DEPT} dept,count(*)::int visits,count(distinct q.patient_id)::int patients,count(distinct q.doctor_user_id)::int doctors_seen from doctor_queue q join users u on u.id=q.doctor_user_id where q.hospital_id=$1 and q.checked_in_at>=$2 and q.checked_in_at<$3 group by 1`)
 const newPts=await q(`select ${DEPT} dept,count(*)::int n from doctor_queue q join users u on u.id=q.doctor_user_id join patients p on p.id=q.patient_id where q.hospital_id=$1 and q.checked_in_at>=$2 and q.checked_in_at<$3 and p.created_at>=$2 and p.created_at<$3 group by 1`)
 const adm=await q(`select ${DEPT} dept,count(*)::int n from admissions a join users u on u.id=a.admitting_doctor_id where a.hospital_id=$1 and a.admitted_at>=$2 and a.admitted_at<$3 group by 1`)
 const tests=await q(`select ${DEPT} dept,count(*)::int n from diagnostic_orders o join users u on u.id=o.ordered_by where o.hospital_id=$1 and o.ordered_at>=$2 and o.ordered_at<$3 and o.status<>'cancelled' group by 1`)
 const consRev=await q(`select ${DEPT} dept,coalesce(sum(i.quantity*i.unit_price),0)::float rev from invoice_items i join invoices v on v.id=i.invoice_id and v.status<>'cancelled' join doctor_queue q on q.id=i.source_id join users u on u.id=q.doctor_user_id where i.source_type='visit' and v.hospital_id=$1 and i.created_at>=$2 and i.created_at<$3 group by 1`)
 const one=async(sql:string,p:any[]=P)=>(await db.query(sql,p)).rows[0]
 const t=await one(`select (select count(*)::int from patients where hospital_id=$1 and created_at>=$2 and created_at<$3) new_patients,
  (select count(*)::int from doctor_queue where hospital_id=$1 and checked_in_at>=$2 and checked_in_at<$3) opd,
  (select count(distinct patient_id)::int from doctor_queue where hospital_id=$1 and checked_in_at>=$2 and checked_in_at<$3) opd_patients,
  (select count(*)::int from admissions where hospital_id=$1 and admitted_at>=$2 and admitted_at<$3) admissions,
  (select count(*)::int from admissions where hospital_id=$1 and discharged_at>=$2 and discharged_at<$3) discharges,
  (select count(*)::int from diagnostic_orders where hospital_id=$1 and ordered_at>=$2 and ordered_at<$3 and status<>'cancelled' and category='lab') lab,
  (select count(*)::int from diagnostic_orders where hospital_id=$1 and ordered_at>=$2 and ordered_at<$3 and status<>'cancelled' and category='radiology') radiology,
  (select count(*)::int from prescriptions where hospital_id=$1 and created_at>=$2 and created_at<$3) rx,
  (select count(*)::int from prescriptions where hospital_id=$1 and created_at>=$2 and created_at<$3 and status='dispensed') rx_dispensed,
  (select count(*)::int from invoices where hospital_id=$1 and created_at>=$2 and created_at<$3 and status<>'cancelled') bills,
  (select coalesce(sum(amount),0)::float from payments where hospital_id=$1 and received_at>=$2 and received_at<$3) collected,
  (select count(*)::int from appointments where hospital_id=$1 and scheduled_at>=$2 and scheduled_at<least($3,now())) appts,
  (select count(*)::int from appointments ap where hospital_id=$1 and scheduled_at>=$2 and scheduled_at<least($3,now()) and (ap.status='checked_in' or exists(select 1 from doctor_queue q where q.appointment_id=ap.id))) appts_kept,
  (select coalesce(sum(i.quantity*i.unit_price),0)::float from invoice_items i join invoices v on v.id=i.invoice_id and v.status<>'cancelled' join diagnostic_orders o on o.id=i.source_id where i.source_type='order' and o.category='lab' and v.hospital_id=$1 and i.created_at>=$2 and i.created_at<$3) lab_rev,
  (select coalesce(sum(i.quantity*i.unit_price),0)::float from invoice_items i join invoices v on v.id=i.invoice_id and v.status<>'cancelled' join diagnostic_orders o on o.id=i.source_id where i.source_type='order' and o.category='radiology' and v.hospital_id=$1 and i.created_at>=$2 and i.created_at<$3) rad_rev,
  (select coalesce(sum(i.quantity*i.unit_price),0)::float from invoice_items i join invoices v on v.id=i.invoice_id and v.status<>'cancelled' where i.source_type='dispense' and v.hospital_id=$1 and i.created_at>=$2 and i.created_at<$3) rx_rev,
  (select coalesce(sum(i.quantity*i.unit_price),0)::float from invoice_items i join invoices v on v.id=i.invoice_id and v.status<>'cancelled' where i.source_type='surgery' and v.hospital_id=$1 and i.created_at>=$2 and i.created_at<$3) ot_rev,
  (select coalesce(sum(extract(epoch from (least(coalesce(discharged_at,now()),$3)-greatest(admitted_at,$2)))/86400),0)::float from admissions where hospital_id=$1 and admitted_at<$3 and coalesce(discharged_at,now())>$2) bed_days,
  (select round(avg(extract(epoch from discharged_at-admitted_at)/86400)::numeric,1)::float from admissions where hospital_id=$1 and discharged_at>=$2 and discharged_at<$3) alos`)
 // Departments added later (emergency, OT) may not exist on older databases: count them only when their table is there.
 const has=async(tb:string)=>!!(await one(`select to_regclass($1) r`,[tb])).r
 t.er=await has('er_visits')?(await one(`select count(*)::int n from er_visits where hospital_id=$1 and arrived_at>=$2 and arrived_at<$3`)).n:null
 t.er_admitted=t.er!=null?(await one(`select count(*)::int n from er_visits where hospital_id=$1 and arrived_at>=$2 and arrived_at<$3 and disposition='admitted'`)).n:0
 t.surgeries=await has('surgeries')?(await one(`select count(*)::int n from surgeries where hospital_id=$1 and scheduled_start>=$2 and scheduled_start<$3 and status='completed'`)).n:null
 t.patients=(await one(`select count(distinct pid)::int n from (select patient_id pid from doctor_queue where hospital_id=$1 and checked_in_at>=$2 and checked_in_at<$3 union select patient_id from admissions where hospital_id=$1 and admitted_at>=$2 and admitted_at<$3 union select patient_id from diagnostic_orders where hospital_id=$1 and ordered_at>=$2 and ordered_at<$3 union select patient_id from invoices where hospital_id=$1 and created_at>=$2 and created_at<$3) x`)).n
 const by=(rows:any[],k='n')=>new Map(rows.map((r:any)=>[r.dept,r[k]]))
 return {t,depts,newPts:by(newPts),adm:by(adm),tests:by(tests),consRev:by(consRev,'rev')}}

export async function patientFlow(db:Db,ctx:Ctx,o:{from?:string;to?:string;now?:Date}={}){if(ctx.role!=='admin')throw new HttpError(403,'Only an admin can see patient flow.');const now=o.now||new Date();const today=istDate(now)
 const from=o.from||today,to=o.to||today;if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new HttpError(400,'Pick a valid date range.')
 const h=ctx.hospitalId,days=Math.round((Date.parse(to)-Date.parse(from))/86400e3)+1,pFrom=addDays(from,-days),pTo=addDays(from,-1)
 const [cur,prev]=await Promise.all([window_(db,h,istToUtc(from,0),istToUtc(to,1440)),window_(db,h,istToUtc(pFrom,0),istToUtc(pTo,1440))])
 const staff=Object.fromEntries((await db.query(`select role::text role,count(*)::int n from users where hospital_id=$1 and active and role::text<>'patient' group by 1`,[h])).rows.map((r:any)=>[r.role,r.n]))
 const docs=new Map((await db.query(`select ${DEPT} dept,count(*)::int n from users u where u.hospital_id=$1 and u.active and u.role::text='doctor' group by 1`,[h])).rows.map((r:any)=>[r.dept,r.n]))
 const labStaff=(await db.query(`select count(*) filter(where coalesce(department,'') ilike '%radio%')::int rad,count(*) filter(where coalesce(department,'') not ilike '%radio%')::int lab from users where hospital_id=$1 and active and role::text='lab'`,[h])).rows[0]
 const beds=(await db.query(`select (select count(*)::int from beds where hospital_id=$1 and active) total,(select count(*)::int from admissions where hospital_id=$1 and status='admitted') occupied`,[h])).rows[0]
 const backlog=(await db.query(`select (select count(*)::int from diagnostic_orders where hospital_id=$1 and category='lab' and status in ('ordered','sample_collected')) lab,(select count(*)::int from diagnostic_orders where hospital_id=$1 and category='radiology' and status in ('ordered','sample_collected')) radiology,(select count(*)::int from prescriptions where hospital_id=$1 and status='pending' and created_at>now()-interval '2 days') rx,(select count(*)::int from invoices where hospital_id=$1 and status in ('open','partially_paid')) bills,(select count(*)::int from doctor_queue where hospital_id=$1 and status='waiting' and checked_in_at>now()-interval '18 hours') opd`,[h])).rows[0]
 const a=istToUtc(from,0),b=istToUtc(to,1440)
 const hours=(await db.query(`select extract(hour from checked_in_at at time zone 'Asia/Kolkata')::int hr,count(*)::int n from doctor_queue where hospital_id=$1 and checked_in_at>=$2 and checked_in_at<$3 group by 1`,[h,a,b])).rows
 const wdays=(await db.query(`select extract(dow from checked_in_at at time zone 'Asia/Kolkata')::int d,count(*)::int n from doctor_queue where hospital_id=$1 and checked_in_at>=$2 and checked_in_at<$3 group by 1`,[h,a,b])).rows
 const T=cur.t,P=prev.t,kpi=(k:string)=>({value:T[k],prev:P[k],change:T[k]==null?null:pct(T[k],P[k])})
 const totalOpd=T.opd||0
 // Doctors' departments
 const names=[...new Set([...cur.depts.map((d:any)=>d.dept),...docs.keys()])]
 const departments=names.map(n=>{const c=cur.depts.find((d:any)=>d.dept===n)||{visits:0,patients:0,doctors_seen:0},p=prev.depts.find((d:any)=>d.dept===n)||{visits:0};const doctors=docs.get(n)||c.doctors_seen||0;const rev=cur.consRev.get(n)||0
  return {dept:n,visits:c.visits,patients:c.patients,prev:p.visits,change:pct(c.visits,p.visits),perDay:r1(c.visits/days),doctors,perDoctorDay:doctors?r1(c.visits/doctors/days):null,share:totalOpd?Math.round(100*c.visits/totalOpd):0,
   newPatients:cur.newPts.get(n)||0,admitted:cur.adm.get(n)||0,admitRate:c.visits?Math.round(100*(cur.adm.get(n)||0)/c.visits):null,testsOrdered:cur.tests.get(n)||0,revenue:rev,revenuePerDoctor:doctors?Math.round(rev/doctors):null}}).sort((x,y)=>y.visits-x.visits||x.dept.localeCompare(y.dept))
 // Service departments: volume, the staff who do that work, pending work now, revenue
 const svc=(key:string,name:string,unit:string,vol:number|null,pv:number|null,staffN:number|null,staffLabel:string,pending:number|null,revenue:number|null,extra:any={})=>({key,name,unit,volume:vol,prev:pv,change:vol==null?null:pct(vol,pv||0),perDay:vol==null?null:r1(vol/days),staff:staffN,staffLabel,perStaffDay:vol!=null&&staffN?r1(vol/staffN/days):null,pending,revenue,...extra})
 const avgOcc=beds.total?Math.round(100*T.bed_days/(beds.total*days)):null
 const services=[
  svc('desk','Front desk','registrations + check-ins',T.new_patients+T.opd,P.new_patients+P.opd,staff.reception||0,'front desk staff',backlog.opd,null),
  svc('lab','Lab','tests',T.lab,P.lab,labStaff.lab,'lab staff',backlog.lab,T.lab_rev),
  svc('radiology','Radiology','scans',T.radiology,P.radiology,labStaff.rad||null,'radiology staff',backlog.radiology,T.rad_rev),
  svc('pharmacy','Pharmacy','prescriptions',T.rx,P.rx,staff.pharmacy||0,'pharmacists',backlog.rx,T.rx_rev,{fillRate:T.rx?Math.round(100*T.rx_dispensed/T.rx):null}),
  svc('ipd','Wards (IPD)','admissions',T.admissions,P.admissions,staff.nurse||0,'nurses',null,null,{occupiedNow:beds.occupied,beds:beds.total,occupancyNow:beds.total?Math.round(100*beds.occupied/beds.total):null,avgOccupancy:avgOcc,bedsPerNurse:staff.nurse?r1(beds.occupied/staff.nurse):null,alos:T.alos,discharges:T.discharges}),
  ...(T.er!=null?[svc('er','Emergency','visits',T.er,P.er,null,'',null,null,{admitRate:T.er?Math.round(100*T.er_admitted/T.er):null})]:[]),
  ...(T.surgeries!=null?[svc('ot','Operation theatre','surgeries',T.surgeries,P.surgeries,null,'',null,T.ot_rev)]:[]),
  svc('billing','Billing','bills',T.bills,P.bills,staff.billing||0,'billing staff',backlog.bills,T.collected)]
 const appts={booked:T.appts,kept:T.appts_kept,missed:Math.max(0,T.appts-T.appts_kept),noShowRate:T.appts?Math.round(100*(T.appts-T.appts_kept)/T.appts):null}
 const hourly=Array.from({length:24},(_,i)=>hours.find((x:any)=>x.hr===i)?.n||0),weekday=Array.from({length:7},(_,i)=>wdays.find((x:any)=>x.d===i)?.n||0)
 // Suggested actions, most urgent first
 const acts:Act[]=[]
 for(const d of departments){if(!d.visits)continue
  if(d.perDoctorDay!=null&&d.perDoctorDay>KPI.busyDoctor)acts.push({level:'add',area:d.dept,text:`Add a doctor in ${d.dept}`,why:`Each doctor sees ${d.perDoctorDay} patients a day (more than ${KPI.busyDoctor}).`})
  else if(d.perDoctorDay!=null&&d.perDoctorDay<KPI.quietDoctor&&days>=7)acts.push({level:'improve',area:d.dept,text:`${d.dept} is under-used`,why:`Only ${d.perDoctorDay} patients per doctor a day. Promote the department, add OPD days, or share doctors with a busier one.`})
  if(d.change!=null&&d.change>=KPI.trend&&d.visits>=20)acts.push({level:'watch',area:d.dept,text:`Demand rising in ${d.dept}`,why:`${d.visits} visits, up ${d.change}% on the period before. Plan staff ahead.`})
  if(d.change!=null&&d.change<=-KPI.trend&&d.prev>=20)acts.push({level:'improve',area:d.dept,text:`Visits falling in ${d.dept}`,why:`${d.visits} visits, down ${-d.change}% on the period before. Check doctor availability and patient feedback.`})}
 const ipd:any=services.find(s=>s.key==='ipd')
 if(ipd.avgOccupancy!=null&&ipd.avgOccupancy>KPI.highOccupancy)acts.push({level:'add',area:'Wards',text:'Add beds or speed up discharges',why:`Beds were ${ipd.avgOccupancy}% full on average (over ${KPI.highOccupancy}%).`})
 else if(ipd.avgOccupancy!=null&&ipd.beds>0&&ipd.avgOccupancy<KPI.lowOccupancy&&days>=7)acts.push({level:'improve',area:'Wards',text:'Beds are under-used',why:`Only ${ipd.avgOccupancy}% average occupancy. Consider fewer staffed wards or more admitting doctors.`})
 if(ipd.bedsPerNurse!=null&&ipd.bedsPerNurse>KPI.bedsPerNurse)acts.push({level:'add',area:'Nursing',text:'Add nurses',why:`${ipd.bedsPerNurse} occupied beds per nurse (aim for ${KPI.bedsPerNurse} or fewer in general wards).`})
 if(beds.occupied>0&&!staff.nurse)acts.push({level:'add',area:'Nursing',text:'Add nurses to the system',why:`${beds.occupied} patients are admitted but no nurse accounts exist.`})
 const lab:any=services.find(s=>s.key==='lab');if(lab.perStaffDay!=null&&lab.perStaffDay>KPI.labPerStaff)acts.push({level:'add',area:'Lab',text:'Add a lab technician',why:`${lab.perStaffDay} tests per lab staff a day (more than ${KPI.labPerStaff}).`})
 if(lab.pending>0&&lab.perDay>0&&lab.pending>lab.perDay)acts.push({level:'improve',area:'Lab',text:'Lab backlog is building',why:`${lab.pending} tests pending, more than a day's volume (${lab.perDay}).`})
 const ph:any=services.find(s=>s.key==='pharmacy');if(ph.fillRate!=null&&ph.volume>=10&&ph.fillRate<KPI.pharmacyFill)acts.push({level:'improve',area:'Pharmacy',text:'Medicines are being bought outside',why:`Only ${ph.fillRate}% of prescriptions were dispensed here. Check stock and prices; this is lost revenue.`})
 const desk:any=services.find(s=>s.key==='desk');if(desk.perStaffDay!=null&&desk.perStaffDay>KPI.deskPerStaff)acts.push({level:'add',area:'Front desk',text:'Add front-desk staff',why:`${desk.perStaffDay} registrations and check-ins per person a day.`})
 if(appts.noShowRate!=null&&appts.booked>=10&&appts.noShowRate>KPI.noShow)acts.push({level:'improve',area:'Appointments',text:'Too many missed appointments',why:`${appts.noShowRate}% of booked patients did not come (${appts.missed} of ${appts.booked}). Send reminders or allow overbooking.`})
 const peak=hourly.indexOf(Math.max(...hourly));if(totalOpd>=10){const share=Math.round(100*hourly[peak]/totalOpd);acts.push({level:'info',area:'Roster',text:`Busiest hour: ${peak}:00–${peak+1}:00`,why:`${share}% of OPD arrivals come in this hour. Put more doctors and front-desk staff on duty then.`})}
 const order={add:0,improve:1,watch:2,info:3};acts.sort((x,y)=>order[x.level]-order[y.level])
 return {from,to,days,previous:{from:pFrom,to:pTo},
  totals:{patients:kpi('patients'),newPatients:kpi('new_patients'),opd:kpi('opd'),admissions:kpi('admissions'),er:kpi('er'),surgeries:kpi('surgeries'),lab:kpi('lab'),radiology:kpi('radiology'),prescriptions:kpi('rx'),collected:kpi('collected')},
  departments,services,appointments:appts,hourly,weekday,staff,actions:acts,thresholds:KPI,generatedAt:now}}
