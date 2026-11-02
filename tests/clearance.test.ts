import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {checkIn,startEncounter,addDiagnosis,prescribe,closeEncounter} from '../lib/services/opd'
import {addCatalogItem,orderTest,advanceOrder} from '../lib/services/diagnostics'
import {addBed,admit} from '../lib/services/ipd'
import {addMedicine,receiveStock,dispense} from '../lib/services/pharmacy'
import {recordPayment,invoiceTotals} from '../lib/services/billing'
import {autoBill,unbilledCharges,consultationFee,doctorFees,finishConsultation} from '../lib/services/flows'
import {updateStaff} from '../lib/services/tenancy'
import {clearanceView,requestClearance,signDepartment,finalizeClearance,billPending,clearanceWorklist,signAllReady} from '../lib/services/clearance'
import {matchStock,rxQuantity,sameDrug} from '../lib/rxmatch'
const rejects=(p:Promise<unknown>,status:number)=>assert.rejects(p,(e:any)=>e.status===status)
const dept=(v:any,k:string)=>v.departments.find((d:any)=>d.key===k)

test('patient clearance: every involved department signs, billing issues the clearance only with no dues', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Clear Hospital')
 const rec=await mk('reception','Rita Desk'),doc=await mk('doctor','Dr Mehta'),nurse=await mk('nurse','Nina Ward'),lab=await mk('lab','Lab Tech'),ph=await mk('pharmacy','Pharma One'),bill=await mk('billing','Bill Clerk')
 await addCatalogItem(db,admin,{code:'OPD',name:'General consultation',category:'consultation',price:500})
 const cbc=await addCatalogItem(db,admin,{code:'CBC',name:'Complete blood count',category:'lab',price:350})
 const bed=await addBed(db,admin,{ward:'General',bedNo:'G1',bedType:'general',dailyRate:1000})
 const p=await registerPatient(db,rec,{fullName:'Clear Patient',mobile:'9000000501',gender:'Female'})
 const t=await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId})
 const e=await startEncounter(db,doc,{queueId:t.id,chiefComplaint:'Fever'})
 await addDiagnosis(db,doc,{encounterId:e.id,icd10Code:'A90',description:'Dengue fever'})
 await prescribe(db,doc,{encounterId:e.id,items:[{medicine:'Paracetamol 650mg',dose:'1 tab',frequency:'1-1-1',duration:'3 days'}]})
 const o=await orderTest(db,doc,{patientId:p.id,encounterId:e.id,serviceId:cbc.id})
 await admit(db,doc,{patientId:p.id,doctorId:doc.userId,bedId:bed.id,reason:'Observation'})

 let v=await clearanceView(db,nurse,p.id)
 assert.equal(v.clearance,null);assert.equal(dept(v,'radiology').status,'not_involved')
 for(const k of ['opd','lab','pharmacy'])assert.equal(dept(v,k).status,'pending',k)
 assert.equal(dept(v,'ipd').status,'ready');assert.ok(dept(v,'billing').openItems>0)

 v=await requestClearance(db,nurse,p.id);assert.ok(v.clearance);assert.equal(v.canFinalize,false)
 assert.equal((await requestClearance(db,rec,p.id)).clearance!.id,v.clearance!.id,'second request reuses the open clearance')

 // Lab cannot sign with open work unless it writes why; other roles cannot sign for lab; radiology not involved.
 await rejects(signDepartment(db,lab,p.id,'lab'),409)
 await rejects(signDepartment(db,rec,p.id,'lab'),403)
 await rejects(signDepartment(db,lab,p.id,'radiology'),409)
 assert.ok((await clearanceWorklist(db,lab,true)).some(w=>w.patient.id===p.id),'lab sees the patient in its list')
 await advanceOrder(db,lab,o.id,{action:'collect'});await advanceOrder(db,lab,o.id,{action:'result',resultText:'Platelets 92,000'})
 assert.equal((await signAllReady(db,lab,'lab')).signed,1)
 v=await clearanceView(db,lab,p.id);assert.equal(dept(v,'lab').status,'signed')

 // Pharmacy clears with a note (patient buys outside); the note and the open item are kept on the record.
 await rejects(signDepartment(db,ph,p.id,'pharmacy'),409)
 v=await signDepartment(db,ph,p.id,'pharmacy',{note:'Patient will buy outside'});assert.equal(dept(v,'pharmacy').signoff.withOpenItems,true)

 // Hold blocks the clearance until the department signs.
 v=await signDepartment(db,nurse,p.id,'ipd',{note:'Return the wheelchair',hold:true});assert.equal(dept(v,'ipd').status,'hold');assert.ok(v.blockers.some((b:string)=>b.includes('on hold')))
 await signDepartment(db,nurse,p.id,'ipd')
 await closeEncounter(db,doc,{encounterId:e.id,advice:'Fluids'});await signDepartment(db,doc,p.id,'opd')

 // Dues: consultation + CBC + 1 bed-day are pending; billing cannot issue until paid.
 await rejects(finalizeClearance(db,bill,p.id),409)
 const pend=await unbilledCharges(db,bill,p.id);const bedLine=pend.find(c=>c.sourceType==='bed')!
 assert.equal(bedLine.quantity,1);assert.equal(bedLine.unitPrice,1000);assert.equal(pend.reduce((s,c)=>s+c.unitPrice*(c.quantity||1),0),1850)
 v=await billPending(db,bill,p.id);assert.equal((await unbilledCharges(db,bill,p.id)).length,0,'bed-days are not billed twice')
 const inv=(await db.query("select id from invoices where patient_id=$1 and status in ('open','partially_paid')",[p.id])).rows[0]
 await recordPayment(db,bill,inv.id,{amount:(await invoiceTotals(db,inv.id)).balance,mode:'upi',reference:'UTR1'})
 await rejects(finalizeClearance(db,doc,p.id),403)
 const done=await finalizeClearance(db,bill,p.id);assert.match(done.issued,/\/CLR\/\d{4}\/000001$/);assert.equal(done.clearance,null);assert.equal(done.lastCleared!.clearanceNo,done.issued)

 // New work after a sign-off re-opens that department.
 const v2=await requestClearance(db,rec,p.id);assert.notEqual(v2.clearance!.id,v.clearance!.id)
 const e2=await startEncounter(db,doc,{patientId:p.id,chiefComplaint:'Review'});await signDepartment(db,doc,p.id,'opd',{note:'Seen'})
 await orderTest(db,doc,{patientId:p.id,encounterId:e2.id,serviceId:cbc.id});await signAllReady(db,lab,'lab')
 const v3=await clearanceView(db,bill,p.id);assert.equal(dept(v3,'lab').status,'pending','a new order needs lab again')
})

test('consultation fee: OPD default, never emergency; per-doctor fee', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Fee Hospital');const doc=await mk('doctor','Dr Fee'),doc2=await mk('doctor','Dr Spl')
 await addCatalogItem(db,admin,{code:'OPD-EMR',name:'Emergency consultation',category:'consultation',price:1000})
 await addCatalogItem(db,admin,{code:'OPD-FU',name:'Follow-up consultation',category:'consultation',price:300})
 await addCatalogItem(db,admin,{code:'OPD',name:'General consultation',category:'consultation',price:500})
 const spl=await addCatalogItem(db,admin,{code:'OPD-SPL',name:'Specialist consultation',category:'consultation',price:800})
 assert.equal(Number((await consultationFee(db,admin))!.price),500)
 await updateStaff(db,admin,doc2.userId,{consultationServiceId:spl.id})
 const f=await doctorFees(db,admin);assert.equal(f[doc.userId]!.price,500);assert.equal(f[doc2.userId]!.price,800)
})

test('finishing an empty consultation is refused; pharmacy refuses an unconfirmed substitution', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Safe Hospital');const rec=await mk('reception','R'),doc=await mk('doctor','Dr Safe'),ph=await mk('pharmacy','Ph')
 const p=await registerPatient(db,rec,{fullName:'Safe Patient'});const t=await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId})
 const e=await startEncounter(db,doc,{queueId:t.id})
 await rejects(finishConsultation(db,doc,e.id,{}),400)
 await finishConsultation(db,doc,e.id,{diagnoses:[{description:'Hypertension',icd10Code:'I10'}],items:[{medicine:'Amlodipine 5mg',dose:'1 tab',frequency:'1-0-0',duration:'30 days'}]})
 const aml=await addMedicine(db,ph,{name:'Amlodipine',strength:'5mg',form:'tablet',unitPrice:4}),ibu=await addMedicine(db,ph,{name:'Ibuprofen',strength:'400mg',form:'tablet',unitPrice:4})
 for(const m of [aml,ibu])await receiveStock(db,ph,{medicineId:m.id,batchNo:'B'+m.id.slice(0,4),expiryDate:'2030-01-01',quantity:100})
 const rx=(await db.query('select id from prescriptions where patient_id=$1',[p.id])).rows[0]
 await rejects(dispense(db,ph,rx.id,{lines:[{medicineId:ibu.id,quantity:30,prescribed:'Amlodipine 5mg'}]}),409)
 const ok=await dispense(db,ph,rx.id,{lines:[{medicineId:aml.id,quantity:30,prescribed:'Amlodipine 5mg'}]});assert.equal(ok.total,120)
})

test('rx matching and quantity helpers', ()=>{
 assert.ok(sameDrug('Amlodipine 5mg','Amlodipine','5mg'));assert.ok(!sameDrug('Amlodipine 5mg','Ibuprofen','400mg'));assert.ok(!sameDrug('Amlodipine 5mg','Amlodipine','10mg'))
 assert.ok(sameDrug('Amoxicillin syrup 125mg/5ml','Amoxicillin syrup','125mg/5ml'));assert.ok(sameDrug('ORS powder 21.8g','ORS powder','21.8g'))
 assert.equal(matchStock('Metformin 500mg',[{name:'Metformin',strength:'500mg',in_stock:5},{name:'Paracetamol',strength:'650mg'}])!.name,'Metformin')
 assert.equal(rxQuantity('1 tab','1-0-1','30 days'),60);assert.equal(rxQuantity('1 tab','TDS','5 days'),15);assert.equal(rxQuantity('½ tab','BD','2 weeks'),14);assert.equal(rxQuantity('5 ml','1-1-1','5 days'),null)
})
