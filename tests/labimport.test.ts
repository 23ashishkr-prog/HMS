import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addCatalogItem,orderTest} from '../lib/services/diagnostics'
import {parseHL7,parseCSV,importResults,hospitalForKey,rotateLabKey,listImports,verifyImport} from '../lib/services/labimport'
import {startEncounter,checkIn} from '../lib/services/opd'
const hl7=(uhid:string,order:string)=>['MSH|^~\\&|SYSMEX|LAB|HMS|HOSP|20261021101500||ORU^R01|MSG0001|P|2.5.1','PID|1||'+uhid+'^^^HOSP||Doe^John','OBR|1|'+order+'||CBC^Complete Blood Count','OBX|1|NM|718-7^Hemoglobin||9.8|g/dL|13-17|L|||F','OBX|2|NM|6690-2^WBC||11.2|10*3/uL|4-11|H|||F','OBX|3|NM|777-3^Platelets||240|10*3/uL|150-450|N|||F','OBX|4|NM|X^Deleted||1|||N|||D'].join('\r')
test('HL7/CSV parsing',()=>{const p=parseHL7(hl7('U1','O1'));assert.equal(p.messageId,'MSG0001');assert.equal(p.groups[0].uhid,'U1');assert.equal(p.groups[0].test,'Complete Blood Count');assert.equal(p.groups[0].obs.length,3);assert.equal(p.groups[0].obs[0].name,'Hemoglobin')
 assert.throws(()=>parseHL7('MSH|^~\\&|A|B|C|D|x||ADT^A01|1|P|2.5'),/ORU/);assert.throws(()=>parseHL7('hello'),/MSH/)
 const c=parseCSV('uhid,test,analyte,value,unit,range,flag\nU1,CBC,Hb,"10,5",g/dL,13-17,L\nU1,CBC,TLC,7000,/uL,4000-11000,\nU2,LFT,ALT,80,U/L,7-56,H');assert.equal(c.groups.length,2);assert.equal(c.groups[0].obs[0].value,'10,5')
 assert.throws(()=>parseCSV('foo,bar\n1,2'),/header/)})
test('import → pending verification → verify releases result; unmatched; duplicate; key auth; tenant isolation',async()=>{const db=await freshDb();const {h,admin,mk}=await tenant(db,'Lab Imp');const rec=await mk('reception','R L'),doc=await mk('doctor','Dr L'),lab=await mk('lab','Lab L')
 const cbc=await addCatalogItem(db,admin,{code:'CBC',name:'Complete Blood Count',category:'lab',price:300});const p=await registerPatient(db,rec,{fullName:'Lab Pt',mobile:'9876500661'})
 const q=await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId});const e=await startEncounter(db,doc,{queueId:q.id});const o=await orderTest(db,doc,{patientId:p.id,encounterId:e.id,serviceId:cbc.id})
 assert.equal(await hospitalForKey(db,'hmslab_nope_nope_nope_nope_nope'),null);const k=await rotateLabKey(db,admin);assert.equal(await hospitalForKey(db,k.key!),h.hospitalId)
 await assert.rejects(rotateLabKey(db,lab),(x:any)=>x.status===403)
 const r=await importResults(db,h.hospitalId,hl7(p.uhid,(o as any).id||(o as any).order?.id),'hl7');assert.equal(r.results[0].status,'pending')
 assert.equal((await db.query('select status,result_text from diagnostic_orders where id=$1',[r.results[0].id?((await db.query('select order_id from lab_result_imports where id=$1',[r.results[0].id])).rows[0].order_id):null])).rows[0].status,'ordered') // not released yet
 const dup=await importResults(db,h.hospitalId,hl7(p.uhid,'x'),'hl7');assert.equal(dup.results[0].status,'duplicate')
 const un=await importResults(db,h.hospitalId,'uhid,test,analyte,value\nNOPE-1,CBC,Hb,12','csv');assert.equal(un.results[0].status,'unmatched')
 const list=await listImports(db,lab);assert.equal(list.length,2)
 await assert.rejects(verifyImport(db,lab,un.results[0].id,{action:'verify'}),(x:any)=>x.status===400)
 const v=await verifyImport(db,lab,r.results[0].id,{action:'verify',resultText:'Hemoglobin 9.8 g/dL (ref 13-17) L; WBC 11.2 (ref 4-11) H'});assert.equal(v.status,'verified')
 const ord=(await db.query('select status,result_text from diagnostic_orders where id=$1',[v.orderId])).rows[0];assert.equal(ord.status,'completed');assert.match(ord.result_text,/Hemoglobin 9.8/)
 await assert.rejects(verifyImport(db,lab,r.results[0].id,{action:'verify'}),(x:any)=>x.status===409)
 assert.equal((await verifyImport(db,lab,un.results[0].id,{action:'reject',reason:'unknown patient'})).status,'rejected')
 const o2=await tenant(db,'Lab Other');const ol=await o2.mk('lab','Lab O');await assert.rejects(verifyImport(db,ol,r.results[0].id,{action:'verify'}),(x:any)=>x.status===404)
 await rotateLabKey(db,admin,true);assert.equal(await hospitalForKey(db,k.key!),null)})
