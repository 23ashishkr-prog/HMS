import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addBed,admit,discharge,staffSummary,publicSummary,summaryLink} from '../lib/services/ipd'
import {requestClearance,finalizeClearance,signDepartment} from '../lib/services/clearance'

test('discharge waits for clearance; admin override is recorded; summary prints and opens from the signed link', async()=>{
 process.env.LINK_SECRET='test-link-secret'
 const db=await freshDb();const t=await tenant(db,'Ward Care');const rec=await t.mk('reception','Desk'),doc=await t.mk('doctor','Dr Ward'),bill=await t.mk('billing','Biller')
 const bed=await addBed(db,t.admin,{ward:'General',bedNo:'G1',dailyRate:0})
 const p=await registerPatient(db,rec,{fullName:'Stay Patient',mobile:'9876509999',gender:'Male'})
 const a=await admit(db,rec,{patientId:p.id,doctorId:doc.userId,bedId:bed.id,reason:'Fever'})
 const form={summary:'Treated with IV fluids, improved',diagnosis:'Dengue fever',condition:'Stable',medications:[{name:'Paracetamol 500',dose:'1 tab',frequency:'1-0-1',duration:'3 days'}],followUpDate:'2026-12-01',type:'normal'}
 const blocked:any=await discharge(db,doc,a.id,form).catch(e=>e)
 assert.equal(blocked.status,409);assert.equal(blocked.extra.code,'clearance_pending');assert.equal(blocked.extra.canOverride,false)
 assert.equal((await discharge(db,doc,a.id,{...form,overrideReason:'family request'}).catch(e=>e)).status,403,'only admin overrides')
 // clear it properly: ward signs, billing issues
 await requestClearance(db,rec,p.id);await signDepartment(db,doc,p.id,'ipd');const c=await finalizeClearance(db,bill,p.id);assert.ok(c.issued)
 const done=await discharge(db,doc,a.id,form);assert.equal(done.status,'discharged');assert.equal(done.clearance_no,c.issued);assert.equal(done.discharge_override,null)
 const s=await staffSummary(db,doc,a.id);assert.equal(s.discharge.diagnosis,'Dengue fever');assert.equal(s.discharge.medications[0].name,'Paracetamol 500');assert.equal(s.discharge.clearanceNo,c.issued);assert.equal(s.patient.uhid,p.uhid)
 const msg=(await db.query("select body from notification_outbox where hospital_id=$1 and kind='discharge'",[t.admin.hospitalId])).rows[0]
 if(msg){const m=String(msg.body).match(/discharge\/([0-9a-f-]+)\?e=(\d+)&s=([\w-]+)/);assert.ok(m,'summary link in the message');const pub=await publicSummary(db,m![1],Number(m![2]),m![3]);assert.equal(pub.admission.no,a.admission_no)}
 {const u=new URL(summaryLink(a.id,Date.now()+86400e3));const pub=await publicSummary(db,a.id,Number(u.searchParams.get('e')),u.searchParams.get('s')!);assert.equal(pub.discharge.diagnosis,'Dengue fever')}
 await assert.rejects(publicSummary(db,a.id,Date.now()+1e6,'forged'),(e:any)=>e.status===403)
 // admin override when there is no clearance
 const p2=await registerPatient(db,rec,{fullName:'Second Patient',mobile:'9876508888'});const a2=await admit(db,rec,{patientId:p2.id,doctorId:doc.userId,bedId:bed.id})
 const ov=await discharge(db,t.admin,a2.id,{...form,type:'death',overrideReason:'Patient expired; family to settle dues'});assert.equal(ov.discharge_type,'death');assert.equal(ov.clearance_no,null);assert.match(ov.discharge_override,/expired/)
})
