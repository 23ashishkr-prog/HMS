/** Complete patient record for clinicians (doctor, nurse, admin) in the same hospital. Every open is audited. */
import {Ctx,Db,HttpError,audit} from './core'
export async function patientRecord(db:Db,ctx:Ctx,patientId:string){if(!['doctor','nurse','admin'].includes(ctx.role))throw new HttpError(403,'Only clinicians can open the full record.')
 const p=(await db.query('select * from patients where id=$1 and hospital_id=$2',[patientId,ctx.hospitalId])).rows[0];if(!p)throw new HttpError(404,'Patient not found.');const H=[ctx.hospitalId,patientId]
 const [enc,dx,vit,rx,items,orders,files,adm,inv,appts]=await Promise.all([
  db.query("select e.id,e.encounter_type,e.chief_complaint,e.history,e.examination,e.advice,e.follow_up_date,e.status,e.created_at,e.closed_at,u.full_name doctor from encounters e left join users u on u.id=e.doctor_user_id where e.hospital_id=$1 and e.patient_id=$2 order by e.created_at desc limit 100",H),
  db.query("select encounter_id,icd10_code,description,diagnosis_type from diagnoses where hospital_id=$1 and patient_id=$2",H),
  db.query("select id,encounter_id,temperature_c,pulse,bp_systolic,bp_diastolic,resp_rate,spo2,weight_kg,height_cm,recorded_at from vitals where hospital_id=$1 and patient_id=$2 order by recorded_at desc limit 50",H),
  db.query("select r.id,r.status,r.created_at,r.dispensed_at,u.full_name doctor from prescriptions r left join users u on u.id=r.doctor_user_id where r.hospital_id=$1 and r.patient_id=$2 order by r.created_at desc limit 60",H),
  db.query("select i.prescription_id,i.medicine_name,i.dose,i.frequency,i.duration,i.instructions from prescription_items i join prescriptions r on r.id=i.prescription_id where r.hospital_id=$1 and r.patient_id=$2",H),
  db.query("select o.id,o.test_name,o.category,o.priority,o.status,o.ordered_at,o.resulted_at,o.result_text,u.full_name ordered_by from diagnostic_orders o left join users u on u.id=o.ordered_by where o.hospital_id=$1 and o.patient_id=$2 order by o.ordered_at desc limit 100",H),
  db.query("select f.id,f.title,f.file_name,f.mime,f.size_bytes,f.order_id,f.created_at,f.verified_at,v.full_name verified_by_name from report_files f left join users v on v.id=f.verified_by where f.hospital_id=$1 and f.patient_id=$2 order by f.created_at desc limit 100",H),
  db.query("select a.id,a.admission_no,a.reason,a.status,a.admitted_at,a.discharged_at,a.discharge_diagnosis,a.discharge_summary,b.ward,b.bed_no,u.full_name doctor from admissions a left join beds b on b.id=a.bed_id left join users u on u.id=a.admitting_doctor_id where a.hospital_id=$1 and a.patient_id=$2 order by a.admitted_at desc",H),
  db.query("select i.id,i.invoice_no,i.status,i.created_at,coalesce((select sum(quantity*unit_price) from invoice_items x where x.invoice_id=i.id),0)-coalesce(i.discount,0) total,coalesce((select sum(amount) from payments y where y.invoice_id=i.id),0) paid from invoices i where i.hospital_id=$1 and i.patient_id=$2 and i.status<>'cancelled' order by i.created_at desc limit 50",H),
  db.query("select a.id,a.scheduled_at,a.status,u.full_name doctor from appointments a left join users u on u.id=a.doctor_user_id where a.hospital_id=$1 and a.patient_id=$2 order by a.scheduled_at desc limit 30",H)])
 const dxBy=new Map<string,any[]>();for(const d of dx.rows){const l=dxBy.get(d.encounter_id)||[];l.push(d);dxBy.set(d.encounter_id,l)}
 const itBy=new Map<string,any[]>();for(const i of items.rows){const l=itBy.get(i.prescription_id)||[];l.push(i);itBy.set(i.prescription_id,l)}
 const visits=enc.rows.map((e:any)=>({...e,diagnoses:dxBy.get(e.id)||[],vitals:vit.rows.find((v:any)=>v.encounter_id===e.id)||null}))
 const prescriptions=rx.rows.map((r:any)=>({...r,items:itBy.get(r.id)||[]}))
 const bills=inv.rows.map((b:any)=>({...b,total:Number(b.total),paid:Number(b.paid),due:Math.max(0,Number(b.total)-Number(b.paid))}))
 const t=(at:any,kind:string,title:string,detail:string,ref?:string)=>({at:new Date(at).toISOString(),kind,title,detail,ref})
 const timeline=[...visits.map((v:any)=>t(v.created_at,'visit',`${v.encounter_type} visit · ${v.doctor||''}`,[v.chief_complaint,v.diagnoses.map((d:any)=>d.description).join(', ')].filter(Boolean).join(' — '),v.id)),
  ...orders.rows.filter((o:any)=>o.resulted_at).map((o:any)=>t(o.resulted_at,'lab',`${o.test_name} result`,o.result_text||'',o.id)),
  ...files.rows.map((f:any)=>t(f.created_at,'report',`Report uploaded: ${f.title}`,f.verified_at?'Verified':'Awaiting verification',f.id)),
  ...prescriptions.map((r:any)=>t(r.created_at,'rx',`Prescription · ${r.items.length} item${r.items.length===1?'':'s'}`,r.items.slice(0,3).map((i:any)=>i.medicine_name).join(', '),r.id)),
  ...adm.rows.map((a:any)=>t(a.admitted_at,'ipd',`Admitted · ${a.ward||''} ${a.bed_no||''}`,a.reason||'',a.id)),...adm.rows.filter((a:any)=>a.discharged_at).map((a:any)=>t(a.discharged_at,'ipd',`Discharged · ${a.admission_no}`,a.discharge_diagnosis||'',a.id)),
  ...bills.map((b:any)=>t(b.created_at,'bill',`Bill ${b.invoice_no}`,`₹${b.total.toFixed(2)} · ${b.due>0?'due ₹'+b.due.toFixed(2):'paid'}`,b.id))].sort((a,b)=>b.at.localeCompare(a.at))
 const age=p.date_of_birth?Math.floor((Date.now()-new Date(p.date_of_birth).getTime())/31557600000):null
 await audit(db,ctx,'view_record','patient',patientId)
 return {patient:{id:p.id,uhid:p.uhid,full_name:p.full_name,gender:p.gender,age,date_of_birth:p.date_of_birth,mobile:p.mobile,email:p.email||null,blood_group:p.blood_group,address:p.address,allergies:p.allergies,abha:p.abha_number||p.abha_id||null,emergency_contact_name:p.emergency_contact_name,emergency_contact_phone:p.emergency_contact_phone,created_at:p.created_at},
  visits,vitals:vit.rows,prescriptions,labs:orders.rows,reports:files.rows,admissions:adm.rows,appointments:appts.rows,
  bills:{items:bills,total:bills.reduce((s:number,b:any)=>s+b.total,0),paid:bills.reduce((s:number,b:any)=>s+b.paid,0),due:bills.reduce((s:number,b:any)=>s+b.due,0)},timeline}}
