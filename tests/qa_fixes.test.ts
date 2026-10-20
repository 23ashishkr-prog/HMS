import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs'
import {freshDb,tenant} from './helpers'
import {frontDeskVisit,finishConsultation,unbilledCharges,autoBill} from '../lib/services/flows'
import {addCatalogItem} from '../lib/services/diagnostics';import {startEncounter,listQueue} from '../lib/services/opd'
import {addMedicine,receiveStock,dispense} from '../lib/services/pharmacy';import {updateSettings,getSettings} from '../lib/services/tenancy'
import {getInvoice,listInvoices} from '../lib/services/billing';import {addBed,admit} from '../lib/services/ipd'
import {authenticate,changeOwnPassword} from '../lib/services/auth';import {journey} from '../lib/services/assistant'
import {passwordLocked} from '../lib/services/auth'
const exp=new Date(Date.now()+300*864e5).toISOString().slice(0,10)
async function setup(name:string){const db=await freshDb();const t=await tenant(db,name);const rec=await t.mk('reception','Desk'),doc=await t.mk('doctor','Dr P'),ph=await t.mk('pharmacy','Pharma'),bill=await t.mk('billing','Biller')
 const m=await addMedicine(db,ph,{name:'Paracetamol',strength:'500 mg',form:'tablet',unitPrice:2.5});await receiveStock(db,ph,{medicineId:m.id,batchNo:'B1',expiryDate:exp,quantity:50})
 const v=await frontDeskVisit(db,rec,{patient:{fullName:'Rx Person',mobile:'9876500011',gender:'Female'},doctorId:doc.userId})
 const q=(await listQueue(db,doc))[0];const e=await startEncounter(db,doc,{queueId:q.id});await finishConsultation(db,doc,e.id,{items:[{medicine:'Paracetamol 500 mg',frequency:'1-0-1',quantity:6}]})
 const rx=(await db.query('select id from prescriptions where patient_id=$1',[v.patient.id])).rows[0];return {db,...t,rec,doc,ph,bill,m,v,rx}}
test('pharmacy default: dispensed medicines go to the patient bill once', async()=>{
 const s=await setup('Bill Mode');assert.equal((await getSettings(s.db,s.admin)).hospital.pharmacy_billing,'patient_bill')
 const r:any=await dispense(s.db,s.ph,s.rx.id,{lines:[{medicineId:s.m.id,quantity:6}]});assert.equal(r.billing,'patient_bill');assert.equal(r.receipt,null);assert.equal(r.total,15)
 const pend=await unbilledCharges(s.db,s.bill,s.v.patient.id);const d=pend.find(p=>p.sourceType==='dispense')!;assert.equal(d.quantity,6);assert.equal(d.unitPrice,2.5)
 const b=await autoBill(s.db,s.bill,s.v.patient.id);assert.equal(b.balance,15)
 await assert.rejects(autoBill(s.db,s.bill,s.v.patient.id),(x:any)=>x.status===409)
 const inv=await getInvoice(s.db,s.bill,b.invoiceId);assert.equal(inv.items.filter((i:any)=>i.source_type==='dispense').length,1)
})
test('pharmacy cash-sale: counter receipt paid at once, nothing left for billing', async()=>{
 const s=await setup('Cash Mode');await updateSettings(s.db,s.admin,{pharmacyBilling:'cash_sale'})
 await assert.rejects(dispense(s.db,s.ph,s.rx.id,{lines:[{medicineId:s.m.id,quantity:6}]}),(x:any)=>x.status===400)
 const r:any=await dispense(s.db,s.ph,s.rx.id,{lines:[{medicineId:s.m.id,quantity:6}],paymentMode:'upi'});assert.equal(r.billing,'cash_sale');assert.match(r.receipt.invoiceNo,/\/PH\//);assert.equal(r.receipt.amount,15)
 const inv=await getInvoice(s.db,s.bill,r.receipt.invoiceId);assert.equal(inv.invoice.status,'paid')
 assert.equal((await unbilledCharges(s.db,s.bill,s.v.patient.id)).filter(p=>p.sourceType==='dispense').length,0)
 await assert.rejects(dispense(s.db,s.ph,s.rx.id,{lines:[{medicineId:s.m.id,quantity:1}],paymentMode:'cash'}),(x:any)=>x.status===409)
 await assert.rejects(updateSettings(s.db,s.admin,{pharmacyBilling:'free'}),(x:any)=>x.status===400)
})
test('IPD admission closes the open OPD token', async()=>{
 const db=await freshDb();const t=await tenant(db,'Ward Co');const rec=await t.mk('reception','Desk'),doc=await t.mk('doctor','Dr W')
 const v=await frontDeskVisit(db,rec,{patient:{fullName:'Ward Person',mobile:'9876500022'},doctorId:doc.userId})
 const bed=await addBed(db,t.admin,{ward:'G',bedNo:'1'});await admit(db,rec,{patientId:v.patient.id,doctorId:doc.userId,bedId:bed.id})
 const q=(await db.query('select status,completed_at from doctor_queue where patient_id=$1',[v.patient.id])).rows[0];assert.equal(q.status,'checked');assert.ok(q.completed_at)
})
test('temporary password must be changed; lock lifts afterwards', async()=>{
 const db=await freshDb();const t=await tenant(db,'Pw Co');const n=await t.mk('nurse','Nurse N')
 const u=(await db.query('select must_change_password from users where id=$1',[n.userId])).rows[0];assert.equal(u.must_change_password,true);assert.equal(passwordLocked(u),true);assert.equal(passwordLocked(u,{allowPasswordChange:true}),false)
 await assert.rejects(changeOwnPassword(db,n.userId,n.hospitalId,'wrong-one-xx','NewStrong-pass1'),(x:any)=>x.status===400)
 await assert.rejects(changeOwnPassword(db,n.userId,n.hospitalId,'S3cure-pass!','short'),(x:any)=>x.status===400)
 await changeOwnPassword(db,n.userId,n.hospitalId,'S3cure-pass!','NewStrong-pass1')
 const after=(await db.query('select must_change_password,email from users where id=$1',[n.userId])).rows[0];assert.equal(passwordLocked(after),false)
 await authenticate(db,after.email,'NewStrong-pass1');await assert.rejects(authenticate(db,after.email,'S3cure-pass!'))
})
test('legacy staff route removed; status wording matches next step', ()=>{
 assert.equal(fs.existsSync('app/api/admin/users/route.ts'),false)
 const base={queue:{status:'checked',doctor:'Dr'},ahead:0,admission:null,pendingRx:[],unbilled:[]} as any
 const rad=[{category:'lab',status:'sample_collected',test_name:'CBC'},{category:'radiology',status:'ordered',test_name:'X-ray'}]
 const a=journey({...base,pendingOrders:rad,due:0});assert.match(a.nextStep,/Radiology/);assert.equal(a.where,'Radiology')
 const b=journey({...base,pendingOrders:rad,due:950});assert.match(b.nextStep,/Radiology/);assert.equal(b.where,'Billing counter → Radiology')
 const c=journey({...base,pendingOrders:[{category:'lab',status:'ordered',test_name:'CBC'}],due:100});assert.equal(c.where,'Billing counter → Lab counter')
})
