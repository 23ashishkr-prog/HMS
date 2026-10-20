import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {journey,assistantLookup,publicStatus} from '../lib/services/assistant'
import {registerPatient} from '../lib/services/patients';import {checkIn,startEncounter} from '../lib/services/opd';import {finishConsultation} from '../lib/services/flows'
import {addCatalogItem,advanceOrder} from '../lib/services/diagnostics';import {autoBill} from '../lib/services/flows';import {recordPayment} from '../lib/services/billing';import {dispense} from '../lib/services/pharmacy'
import * as flows from '../lib/services/flows'
const base={queue:null,ahead:0,admission:null,pendingOrders:[],pendingRx:[],due:0,unbilled:[]}
test('journey rules (pure)',()=>{
 assert.equal(journey(base).stage,'registered')
 const w=journey({...base,queue:{status:'waiting',token_no:12,doctor:'Dr X'},ahead:3});assert.equal(w.stage,'waiting_doctor');assert.match(w.nextStep,/Token 12.*~3 ahead/)
 assert.equal(journey({...base,queue:{status:'consultation',doctor:'Dr X'}}).stage,'in_consultation')
 const l=journey({...base,queue:{status:'checked'},pendingOrders:[{test_name:'CBC',category:'lab',status:'ordered'}],due:350});assert.equal(l.stage,'lab_pending');assert.match(l.nextStep,/Pay ₹350 at Billing, then go to the Lab counter for CBC sample/)
 assert.equal(journey({...base,queue:{status:'checked'},pendingRx:[{id:1}]}).stage,'pharmacy_pending')
 assert.match(journey({...base,queue:{status:'checked'},unbilled:[{price:500}]}).nextStep,/Pay ₹500 at Billing/)
 assert.equal(journey({...base,queue:{status:'checked'}}).stage,'done')
 assert.match(journey({...base,admission:{ward:'ICU',bed_no:'3',doctor:'Dr Y'}}).where,/ICU · Bed 3/)})
test('assistant: role-filtered sections, actions, audit, public status, tenant isolation', async()=>{
 const db=await freshDb();const {admin,mk,h}=await tenant(db,'Assist Hosp');const rec=await mk('reception','Rec'),doc=await mk('doctor','Dr A'),lab=await mk('lab','Lab'),ph=await mk('pharmacy','Ph'),bill=await mk('billing','Bill')
 await addCatalogItem(db,admin,{code:'OPD',name:'Consult',category:'consultation',price:500});const cbc=await addCatalogItem(db,admin,{code:'CBC',name:'CBC',category:'lab',price:350})
 const p=await registerPatient(db,rec,{fullName:'Asha Rao',mobile:'9876500011',allergies:'Sulfa'});let r:any=await assistantLookup(db,rec,p.uhid);assert.equal(r.journey.stage,'registered');assert.ok(r.actions.some((a:any)=>a.label.startsWith('Check in')))
 const t=await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId});r=await assistantLookup(db,rec,'98765 00011');assert.equal(r.journey.stage,'waiting_doctor');assert.equal(r.sections.clinical,undefined);assert.equal(r.sections.billing.unbilled.length,1)
 r=await assistantLookup(db,doc,'#'+t.token_no);assert.equal(r.journey.stage,'waiting_doctor');assert.ok(r.sections.clinical);assert.equal(r.sections.billing,undefined);assert.ok(r.actions.some((a:any)=>a.label==='Open consultation'))
 const e=await startEncounter(db,doc,{queueId:t.id});await finishConsultation(db,doc,e.id,{vitals:{pulse:88},diagnoses:[{description:'Fever'}],items:[{medicine:'Paracetamol'}],orderServiceIds:[cbc.id]})
 r=await assistantLookup(db,lab,p.uhid);assert.equal(r.journey.stage,'lab_pending');assert.equal(r.sections.orders.length,1);assert.equal(r.sections.clinical,undefined);assert.equal(r.sections.billing,undefined);assert.deepEqual(r.actions.map((a:any)=>a.label),['Lab worklist','Print next-steps slip'])
 r=await assistantLookup(db,bill,p.uhid);assert.match(r.journey.nextStep,/Pay ₹850 at Billing/);assert.ok(r.actions.some((a:any)=>a.label.startsWith('Collect payment')))
 const ps=await publicStatus(db,{hospitalCode:h.code,id:p.uhid,phone:'9876500011'});assert.equal(ps.stage,'Lab / radiology pending');assert.doesNotMatch(JSON.stringify(ps),/CBC|Fever|Paracetamol|Sulfa/)
 await assert.rejects(publicStatus(db,{hospitalCode:h.code,id:p.uhid,phone:'9000000000'}),(x:any)=>x.status===404)
 const b=await autoBill(db,bill,p.id);await recordPayment(db,bill,b.invoiceId,{amount:b.balance,mode:'cash'})
 const o=(await db.query('select id from diagnostic_orders')).rows[0];await advanceOrder(db,lab,o.id,{action:'collect'});await advanceOrder(db,lab,o.id,{action:'result',resultText:'ok'})
 r=await assistantLookup(db,ph,p.uhid);assert.equal(r.journey.stage,'pharmacy_pending');assert.equal(r.sections.demographics.allergies,'Sulfa')
 await dispense(db,ph,(await db.query('select id from prescriptions')).rows[0].id,{});r=await assistantLookup(db,admin,p.uhid);assert.equal(r.journey.stage,'done')
 assert.ok((await db.query("select count(*)::int n from audit_log where action='assistant_lookup'")).rows[0].n>=7)
 const other=await tenant(db,'Other Hosp');const oRec=await other.mk('reception','O');assert.deepEqual((await assistantLookup(db,oRec,p.uhid)).matches,[]);assert.deepEqual((await assistantLookup(db,oRec,'9876500011')).matches,[])
 await assert.rejects(publicStatus(db,{hospitalCode:other.h.code,id:p.uhid,phone:'9876500011'}),(x:any)=>x.status===404)
 void flows})
