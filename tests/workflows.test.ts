import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient,searchPatients,normalizeAbha} from '../lib/services/patients'
import {checkIn,listQueue,startEncounter,recordVitals,addDiagnosis,prescribe,closeEncounter,getEncounter} from '../lib/services/opd'
import {addCatalogItem,orderTest,advanceOrder,worklist} from '../lib/services/diagnostics'
import {createInvoice,recordPayment,getInvoice} from '../lib/services/billing'
import {addBed,admit,discharge,bedBoard} from '../lib/services/ipd'
import {createClaim,updateClaim} from '../lib/services/insurance'
import {addMedicine,receiveStock,dispense,stock} from '../lib/services/pharmacy'
import {dashboard,auditLog} from '../lib/services/dashboard'
import {requireModule,applyProviderEvent,getSubscription} from '../lib/services/tenancy'
const rejects=(p:Promise<unknown>,status:number)=>assert.rejects(p,(e:any)=>e.status===status)

test('end-to-end OPD → lab → pharmacy → billing → IPD → TPA', async()=>{
 const db=await freshDb();const {admin,mk,h}=await tenant(db,'Sunrise Hospital');const rec=await mk('reception','Rita Desk'),doc=await mk('doctor','Dr Mehta'),lab=await mk('lab','Lab Tech'),ph=await mk('pharmacy','Pharma One'),bill=await mk('billing','Bill Clerk')
 const p=await registerPatient(db,rec,{fullName:'Test Patient',mobile:'98765 43210',gender:'Female',abhaNumber:'91234567890123',abhaAddress:'testpatient'})
 assert.match(p.uhid,new RegExp('^'+h.code+'-\\d{2}-000001$'));assert.equal(p.mobile,'+919876543210');assert.equal(p.abha_number,'91-2345-6789-0123');assert.equal(p.abha_address,'testpatient@abdm')
 await rejects(registerPatient(db,rec,{fullName:'Dup',abhaNumber:'91234567890123'}),409)
 await rejects(registerPatient(db,doc,{fullName:'X'}),403)
 const p2=await registerPatient(db,rec,{fullName:'Second'});assert.ok(p2.uhid.endsWith('000002'))
 const t1=await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId}),t2=await checkIn(db,rec,{patientId:p2.id,doctorId:doc.userId});assert.equal(t1.token_no,1);assert.equal(t2.token_no,2)
 await rejects(checkIn(db,rec,{patientId:p.id,doctorId:doc.userId}),409)
 assert.equal((await listQueue(db,doc)).length,2)
 const e=await startEncounter(db,doc,{queueId:t1.id,chiefComplaint:'Fever 3 days'})
 await recordVitals(db,doc,{encounterId:e.id,temperatureC:'38.4',pulse:96,bpSystolic:120,bpDiastolic:80,spo2:98})
 await rejects(recordVitals(db,doc,{encounterId:e.id,spo2:120}),400)
 await addDiagnosis(db,doc,{encounterId:e.id,icd10Code:'j06.9',description:'Acute URTI'})
 const rx=await prescribe(db,doc,{encounterId:e.id,items:[{medicine:'Paracetamol 650',dose:'1 tab',frequency:'TDS',duration:'3 days',quantity:'9'}]})
 const cbc=await addCatalogItem(db,admin,{code:'cbc',name:'Complete Blood Count',category:'lab',price:350})
 const consult=await addCatalogItem(db,admin,{code:'opd',name:'OPD Consultation',category:'consultation',price:500})
 const o=await orderTest(db,doc,{patientId:p.id,encounterId:e.id,serviceId:cbc.id,priority:'urgent'})
 await rejects(advanceOrder(db,lab,o.id,{action:'result',resultText:'x'}),409)
 await advanceOrder(db,lab,o.id,{action:'collect'});const done=await advanceOrder(db,lab,o.id,{action:'result',resultText:'Hb 12.1 g/dL'});assert.equal(done.status,'completed')
 assert.equal((await worklist(db,lab,{status:'ordered'})).length,0)
 const closed=await closeEncounter(db,doc,{encounterId:e.id,advice:'Fluids, rest'});assert.equal(closed.status,'closed')
 const full=await getEncounter(db,doc,e.id);assert.equal(full.vitals.length,1);assert.equal(full.diagnoses[0].icd10_code,'J06.9');assert.equal(full.prescriptions[0].items.length,1);assert.equal(full.orders.length,1)
 assert.equal((await listQueue(db,doc)).find(q=>q.id===t1.id).status,'checked')
 const med=await addMedicine(db,ph,{name:'Paracetamol',strength:'650mg',form:'tablet',unitPrice:2});await receiveStock(db,ph,{medicineId:med.id,batchNo:'B1',expiryDate:'2099-01-01',quantity:20})
 await rejects(dispense(db,ph,rx.id,{lines:[{medicineId:med.id,quantity:50}]}),409);await dispense(db,ph,rx.id,{lines:[{medicineId:med.id,quantity:9}]});assert.equal((await stock(db,ph))[0].in_stock,11)
 const inv=await createInvoice(db,bill,{patientId:p.id,items:[{serviceId:consult.id},{serviceId:cbc.id}]})
 await rejects(recordPayment(db,bill,inv.id,{amount:1000,mode:'cash'}),400)
 let tot=await recordPayment(db,bill,inv.id,{amount:500,mode:'upi',reference:'UPI123'});assert.equal(tot.balance,350)
 tot=await recordPayment(db,bill,inv.id,{amount:350,mode:'cash'});assert.equal(tot.balance,0);assert.equal((await getInvoice(db,bill,inv.id)).invoice.status,'paid')
 const bed=await addBed(db,admin,{ward:'General',bedNo:'G-1',dailyRate:1500});const a=await admit(db,rec,{patientId:p2.id,doctorId:doc.userId,bedId:bed.id,reason:'Dengue'})
 await rejects(admit(db,rec,{patientId:p.id,doctorId:doc.userId,bedId:bed.id}),409)
 assert.equal((await bedBoard(db,rec))[0].patient_id,p2.id)
 const c=await createClaim(db,bill,{patientId:p2.id,admissionId:a.id,payerName:'Star Health',tpaName:'MediAssist',policyNumber:'P-1',claimedAmount:20000})
 await rejects(updateClaim(db,bill,c.id,{status:'settled',approvedAmount:1}),409);await updateClaim(db,bill,c.id,{status:'preauth_approved',approvedAmount:15000})
 await rejects(discharge(db,doc,a.id,{summary:'ok'}),400);await discharge(db,doc,a.id,{summary:'Recovered',diagnosis:'Dengue fever'})
 const d=await dashboard(db,admin);assert.equal(d.patients,2);assert.equal(d.opd_today,2);assert.equal(d.inpatients,0);assert.equal(d.collections_today,850)
 assert.ok((await auditLog(db,admin)).length>10)
 assert.deepEqual(await searchPatients(db,rec,'nobody-matches'),[])
})

test('tenant isolation: hospital B can never read or write hospital A data', async()=>{
 const db=await freshDb();const A=await tenant(db,'Alpha Care'),B=await tenant(db,'Beta Clinic')
 const recA=await A.mk('reception','A Desk'),docA=await A.mk('doctor','Dr A'),recB=await B.mk('reception','B Desk'),docB=await B.mk('doctor','Dr B'),billB=await B.mk('billing','B Bill')
 const pa=await registerPatient(db,recA,{fullName:'Alpha Only Patient'});const pb=await registerPatient(db,recB,{fullName:'Beta Patient'})
 assert.ok(pa.uhid.endsWith('000001')&&pb.uhid.endsWith('000001')) // independent UHID sequences
 assert.deepEqual((await searchPatients(db,recB,'')).map(x=>x.id),[pb.id])
 await rejects(checkIn(db,recB,{patientId:pa.id,doctorId:docB.userId}),404)
 await rejects(checkIn(db,recB,{patientId:pb.id,doctorId:docA.userId}),404)
 await rejects(createInvoice(db,billB,{patientId:pa.id}),404)
 const t=await checkIn(db,recA,{patientId:pa.id,doctorId:docA.userId});await rejects(startEncounter(db,docB,{queueId:t.id}),404)
 assert.equal((await listQueue(db,docB)).length,0);assert.equal((await dashboard(db,B.admin)).patients,1)
 assert.ok((await auditLog(db,B.admin)).every((x:any)=>x.hospital_id===B.h.hospitalId))
})

test('subscription gating, limits and provider events', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Small Clinic','basic')
 await requireModule(db,admin,'opd');await requireModule(db,admin,'ipd');await rejects(requireModule(db,admin,'ai'),402);await rejects(requireModule(db,admin,'engagement'),402)
 await db.query("update subscriptions set trial_ends_at=now()-interval '1 day' where hospital_id=$1",[admin.hospitalId]);await rejects(requireModule(db,admin,'opd'),402)
 await applyProviderEvent(db,admin.hospitalId,{type:'subscription.activated',planCode:'pro'},{});const s=await getSubscription(db,admin.hospitalId);assert.equal(s.status,'active');assert.equal(s.plan_code,'ai_engage');await requireModule(db,admin,'ai');await requireModule(db,admin,'engagement')
 assert.equal(normalizeAbha(null),null);assert.throws(()=>normalizeAbha('123'))
})
test('dashboard "today" counts use IST calendar day', async()=>{
 const {freshDb,tenant}=await import('./helpers');const {dashboard}=await import('../lib/services/dashboard')
 const db=await freshDb();const {admin}=await tenant(db,'TZ Clinic')
 // 20:00 UTC yesterday-in-UTC is 01:30 IST today → must count as today in India
 const ist=new Date(Date.now()+330*60000);const d=ist.toISOString().slice(0,10)
 await db.query("insert into patients(hospital_id,uhid,full_name,created_at) values($1,'TZ-1','TZ Patient',($2::date - interval '1 day' + interval '20 hours 30 minutes') at time zone 'UTC')",[admin.hospitalId,d])
 assert.equal((await dashboard(db,admin)).registered_today,1)
})
