import {test} from 'node:test';import assert from 'node:assert/strict';import {freshDb,tenant} from './helpers'
import {frontDeskVisit,unbilledCharges} from '../lib/services/flows';import {addCatalogItem} from '../lib/services/diagnostics';import {updateSettings} from '../lib/services/tenancy'
test('consultation billed once; same doctor within free window is covered; after window billed again',async()=>{const db=await freshDb();const {admin,mk}=await tenant(db,'FU Clinic');const rec=await mk('reception','R'),doc=await mk('doctor','Dr A'),doc2=await mk('doctor','Dr B')
 await addCatalogItem(db,admin,{code:'OPD',name:'General check up',category:'consultation',price:500})
 const v1=await frontDeskVisit(db,rec,{patient:{fullName:'Shiv',mobile:'9000011111',gender:'Male'},doctorId:doc.userId,collectMode:'cash'});const pid=v1.patient.id;assert.equal(v1.bill!.paid,500)
 const lines=async()=>(await db.query("select count(*)::int n from invoice_items i join doctor_queue q on q.id=i.source_id where i.source_type='visit' and q.patient_id=$1",[pid])).rows[0].n
 await db.query("update doctor_queue set status='checked' where patient_id=$1",[pid])
 const v2=await frontDeskVisit(db,rec,{patientId:pid,doctorId:doc.userId,collectMode:'cash'});assert.ok(v2.covered,'same-day revisit covered');assert.equal(v2.bill,null);assert.equal(await lines(),1)
 assert.equal((await unbilledCharges(db,rec,pid)).filter((x:any)=>x.sourceType==='visit').length,0,'billing desk sees nothing to charge')
 const v3=await frontDeskVisit(db,rec,{patientId:pid,doctorId:doc2.userId,collectMode:'cash'});assert.equal(v3.covered,null);assert.equal(await lines(),2,'other doctor is billed')
 await db.query("update doctor_queue set status='checked',visit_date=visit_date-8 where patient_id=$1",[pid])
 const v4=await frontDeskVisit(db,rec,{patientId:pid,doctorId:doc.userId,collectMode:'cash'});assert.equal(v4.covered,null);assert.equal(await lines(),3,'after 7 days a new bill')
 await updateSettings(db,admin,{followupFreeDays:0});await db.query("update doctor_queue set status='checked' where patient_id=$1",[pid])
 const v5=await frontDeskVisit(db,rec,{patientId:pid,doctorId:doc.userId,collectMode:'cash'});assert.equal(v5.covered,null,'0 days = always bill')
 await assert.rejects(updateSettings(db,admin,{followupFreeDays:99}),/0-60/)})
test('migration 032 flags (not deletes) old repeat consultation lines',async()=>{const db=await freshDb();const {admin,mk}=await tenant(db,'Old Dup');const rec=await mk('reception','R'),doc=await mk('doctor','Dr T')
 await addCatalogItem(db,admin,{code:'OPD',name:'General check up',category:'consultation',price:500})
 const v1=await frontDeskVisit(db,rec,{patient:{fullName:'Shiv',mobile:'9000022222',gender:'Male'},doctorId:doc.userId,collectMode:'cash'});const pid=v1.patient.id
 await db.query("update doctor_queue set status='checked'");await db.query("insert into doctor_queue(hospital_id,patient_id,doctor_user_id,status,token_no,visit_date) values($1,$2,$3,'checked',9,current_date)",[admin.hospitalId,pid,doc.userId])
 const q2=(await db.query('select id from doctor_queue where token_no=9')).rows[0].id;await db.query("insert into invoice_items(invoice_id,service_id,description,quantity,unit_price,source_type,source_id) select invoice_id,service_id,description,1,500,'visit',$1 from invoice_items limit 1",[q2])
 const sql=(await import('fs')).readFileSync('db/migrations/032_followup_window.sql','utf8');for(const st of sql.split(";").map((x:string)=>x.trim()).filter(Boolean))await db.query(st)
 const r=(await db.query("select count(*) filter(where review_flag is not null)::int f,count(*)::int n from invoice_items")).rows[0];assert.equal(r.n,2,'nothing deleted');assert.equal(r.f,1,'only the repeat line flagged')})
