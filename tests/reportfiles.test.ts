import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {uploadReport,listReports,getReportFile,verifyReport} from '../lib/services/reportfiles'
const PDF=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
test('lab uploads report files per hospital; doctor views; verify; isolation',async()=>{const db:any=await freshDb();const t=await tenant(db,'RF '+Math.random(),'enterprise');const o=await tenant(db,'RF2 '+Math.random(),'enterprise')
 const lab=await t.mk('lab','Lab One'),doc=await t.mk('doctor','Dr View'),rec=await t.mk('reception','Rec'),bill=await t.mk('billing','Bill'),lab2=await o.mk('lab','Other Lab')
 const p=await registerPatient(db,rec,{fullName:'File Patient',mobile:'9876500777'})
 const f=await uploadReport(db,lab,{bytes:PDF,fileName:'cbc.pdf',patientId:p.id,title:'CBC'});assert.equal(f.mime,'application/pdf')
 await assert.rejects(uploadReport(db,lab,{bytes:Buffer.from('<html>'),fileName:'x.html',patientId:p.id}),/Only PDF/)
 await assert.rejects(uploadReport(db,doc,{bytes:PDF,fileName:'a.pdf',patientId:p.id}),/Only lab/)
 await assert.rejects(uploadReport(db,lab2,{bytes:PDF,fileName:'a.pdf',patientId:p.id}),/not found/i)
 const l=await listReports(db,doc,{patientId:p.id});assert.equal(l.length,1);assert.equal(l[0].verified_at,null)
 const g=await getReportFile(db,doc,f.id);assert.equal(Buffer.from(g.data).subarray(0,5).toString(),'%PDF-')
 await assert.rejects(getReportFile(db,lab2,f.id),/not found/i);await assert.rejects(getReportFile(db,bill,f.id),/Forbidden/)
 await verifyReport(db,lab,f.id);assert.ok((await listReports(db,doc,{patientId:p.id}))[0].verified_at)})
