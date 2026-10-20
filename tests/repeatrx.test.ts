import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {lastPrescription} from '../lib/services/repeatrx'
async function rx(db:any,hid:string,pid:string,doc:string,items:any[],at:string){const e=(await db.query("insert into encounters(hospital_id,patient_id,doctor_user_id) values($1,$2,$3) returning id",[hid,pid,doc])).rows[0];const r=(await db.query("insert into prescriptions(hospital_id,patient_id,doctor_user_id,encounter_id,created_at) values($1,$2,$3,$4,$5) returning id",[hid,pid,doc,e.id,at])).rows[0];for(const i of items)await db.query('insert into prescription_items(prescription_id,medicine_name,frequency,duration) values($1,$2,$3,$4)',[r.id,i.m,i.f,i.d]);return r.id}
test('repeat last Rx: latest prescription, safety warnings, no self-duplicate, tenant isolation',async()=>{const db=await freshDb();const {h,mk}=await tenant(db,'Rep Hosp');const rec=await mk('reception','R'),doc=await mk('doctor','Dr Rep')
 const p=await registerPatient(db,rec,{fullName:'Repeat Pt',mobile:'9876500881',allergies:'Penicillin'})
 assert.equal((await lastPrescription(db,doc,p.id)).found,false)
 await rx(db,h.hospitalId,p.id,doc.userId,[{m:'Metformin 500 mg',f:'1-0-1',d:'30 days'}],'2026-01-01')
 const id=await rx(db,h.hospitalId,p.id,doc.userId,[{m:'Amoxicillin 500 mg',f:'1-1-1',d:'5 days'},{m:'Metformin 500 mg',f:'1-0-1',d:'30 days'}],'2026-02-01')
 const r:any=await lastPrescription(db,doc,p.id);assert.equal(r.prescriptionId,id);assert.equal(r.lines.length,2);assert.ok(r.warnings.some((w:any)=>w.severity==='block'&&/llerg/i.test(w.message)));assert.ok(!r.warnings.some((w:any)=>/^dup/.test(w.id)))
 const o=await tenant(db,'Rep Other');const od=await o.mk('doctor','Dr O');await assert.rejects(lastPrescription(db,od,p.id),(e:any)=>e.status===404)
 await assert.rejects(lastPrescription(db,rec,p.id),(e:any)=>e.status===403)})
