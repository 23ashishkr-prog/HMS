import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {patientRecord} from '../lib/services/record'
import {uploadReport} from '../lib/services/reportfiles'
test('full patient record: clinicians only, same hospital, includes reports and audit',async()=>{const db:any=await freshDb();const t=await tenant(db,'PR '+Math.random(),'enterprise');const o=await tenant(db,'PR2 '+Math.random(),'enterprise')
 const doc=await t.mk('doctor','Dr R'),rec=await t.mk('reception','Rec'),lab=await t.mk('lab','Lab'),doc2=await o.mk('doctor','Dr X')
 const p=await registerPatient(db,rec,{fullName:'Rec Patient',mobile:'9876500888',allergies:'Sulfa'})
 await uploadReport(db,lab,{bytes:Buffer.from('%PDF-1.4 x'),fileName:'x.pdf',patientId:p.id,title:'X-ray'})
 const r=await patientRecord(db,doc,p.id);assert.equal(r.patient.allergies,'Sulfa');assert.equal(r.reports.length,1);assert.ok(r.timeline.some((e:any)=>e.kind==='report'))
 await assert.rejects(patientRecord(db,rec,p.id),/clinicians/);await assert.rejects(patientRecord(db,doc2,p.id),/not found/i)
 assert.equal((await db.query("select count(*)::int n from audit_log where action='view_record' and entity_id=$1",[p.id])).rows[0].n,1)})
