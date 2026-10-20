import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {frontDeskVisit,finishConsultation,unbilledCharges,autoBill} from '../lib/services/flows'
import {addCatalogItem} from '../lib/services/diagnostics';import {startEncounter,getEncounter,listQueue} from '../lib/services/opd';import {getInvoice} from '../lib/services/billing'
test('front desk → doctor one-page consult → auto-bill, no double billing', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Quick Clinic');const rec=await mk('reception','Desk'),doc=await mk('doctor','Dr Q'),bill=await mk('billing','Biller')
 await addCatalogItem(db,admin,{code:'OPD',name:'Consultation',category:'consultation',price:400});const cbc=await addCatalogItem(db,admin,{code:'CBC',name:'CBC',category:'lab',price:300})
 const v=await frontDeskVisit(db,rec,{patient:{fullName:'Walk In',mobile:'9123456780',gender:'Male'},doctorId:doc.userId,collectMode:'upi'})
 assert.equal(v.token.token_no,1);assert.equal(v.bill!.balance,0)
 const q=(await listQueue(db,doc))[0];const e=await startEncounter(db,doc,{queueId:q.id})
 await finishConsultation(db,doc,e.id,{vitals:{pulse:80,spo2:99,temperatureC:''},diagnoses:[{description:'Viral fever',icd10Code:'B34.9'}],items:[{medicine:'Paracetamol',frequency:'1-0-1'},{medicine:''}],orderServiceIds:[cbc.id],advice:'Rest'})
 const full=await getEncounter(db,doc,e.id);assert.equal(full.encounter.status,'closed');assert.equal(full.vitals.length,1);assert.equal(full.prescriptions[0].items.length,1);assert.equal(full.orders.length,1)
 const pending=await unbilledCharges(db,bill,v.patient.id);assert.deepEqual(pending.map(p=>p.sourceType),['order'])
 const b=await autoBill(db,bill,v.patient.id);assert.equal(b.balance,300);await assert.rejects(autoBill(db,bill,v.patient.id),(x:any)=>x.status===409)
 assert.equal((await getInvoice(db,bill,b.invoiceId)).items.length,1)
})
