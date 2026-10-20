import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addBed,admit,discharge} from '../lib/services/ipd'
import {createInvoice,recordPayment} from '../lib/services/billing'
import {createClaim,updateClaim} from '../lib/services/insurance'
import {prefillClaim,checklist,setDocument,claimPacket} from '../lib/services/claimpacket'
import {PDFDocument} from 'pdf-lib'
test('insurance: auto-fill from records, checklist (auto-detect + manual), PDF packet, guards',async()=>{const db=await freshDb();const {admin,mk}=await tenant(db,'Ins Hosp');const rec=await mk('reception','R I'),doc=await mk('doctor','Dr Ins'),bill=await mk('billing','Bill I')
 const p=await registerPatient(db,rec,{fullName:'Claim Person',mobile:'9876500551',gender:'Female',dateOfBirth:'1975-03-03'})
 const bed=await addBed(db,admin,{ward:'General',bedNo:'G1',dailyRate:1500});const a=await admit(db,rec,{patientId:p.id,doctorId:doc.userId,bedId:bed.id,reason:'Dengue fever with thrombocytopenia'})
 const inv=await createInvoice(db,bill,{patientId:p.id,admissionId:a.id,items:[{description:'Bed charges 3 days',unitPrice:4500},{description:'CBC × 3',unitPrice:900}]})
 let pf:any=await prefillClaim(db,bill,p.id);assert.equal(pf.admissionId,a.id);assert.equal(pf.claimedAmount,5400);assert.equal(pf.payerName,'');assert.equal(pf.patient.age>=50,true)
 const c=await createClaim(db,bill,{patientId:p.id,admissionId:a.id,invoiceId:inv.id||inv.invoice?.id,payerName:'Star Health',tpaName:'MediAssist',policyNumber:'P/123/2026',claimedAmount:5400})
 pf=await prefillClaim(db,bill,p.id);assert.equal(pf.payerName,'Star Health');assert.equal(pf.fromPreviousClaim,true)
 let ck:any=await checklist(db,bill,c.id);assert.equal(ck.stage,'preauth');assert.equal(ck.complete,false);assert.ok(ck.items.every((i:any)=>i.stage==='preauth'))
 await updateClaim(db,bill,c.id,{status:'preauth_approved',approvedAmount:5000});await discharge(db,doc,a.id,{summary:'Admitted with fever, platelets 40k; IV fluids; recovered.',diagnosis:'A97.1 Dengue with warning signs',advice:'Fluids, review in 7 days'})
 ck=await checklist(db,bill,c.id);assert.equal(ck.stage,'claim');assert.equal(ck.items.find((i:any)=>i.key==='discharge_summary').status,'in_system');assert.equal(ck.items.find((i:any)=>i.key==='final_bill').status,'in_system')
 await assert.rejects(setDocument(db,bill,c.id,{key:'nope',status:'received'}),(e:any)=>e.status===400)
 for(const k of ['id_proof','policy_card','preauth_form','investigations','payment_receipts','pharmacy_bills','claim_form'])ck=await setDocument(db,bill,c.id,{key:k,status:'received'});ck=await setDocument(db,bill,c.id,{key:'kyc_cheque',status:'na'});assert.equal(ck.complete,true)
 const pk=await claimPacket(db,bill,c.id);if(process.env.PACKET_OUT)require('node:fs').writeFileSync(process.env.PACKET_OUT,pk.bytes);const pdf=await PDFDocument.load(pk.bytes);assert.ok(pdf.getPageCount()>=1);assert.match(pk.name,/claim-.*\.pdf$/);assert.equal(Buffer.from(pk.bytes).subarray(0,4).toString(),'%PDF')
 await assert.rejects(claimPacket(db,doc,c.id),(e:any)=>e.status===403)
 const o=await tenant(db,'Ins Other');const ob=await o.mk('billing','B O');await assert.rejects(claimPacket(db,ob,c.id),(e:any)=>e.status===404)})
