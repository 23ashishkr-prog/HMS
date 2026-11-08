import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addMedicine} from '../lib/services/pharmacy'
import {addCatalogItem} from '../lib/services/diagnostics'
import {updateSettings,getSettings} from '../lib/services/tenancy'
import {createInvoice,addItem,setDiscount,getInvoice} from '../lib/services/billing'
import {gstBreakup,setBuyer,einvoiceJson,recordIrn,tallyXml,gstSummaryCsv} from '../lib/services/gst'
import {invoicePdf} from '../lib/services/invoicepdf'

test('GST: medicines taxed out of MRP, services exempt; B2B e-invoice, IRN, Tally and GST exports', async()=>{
 const db=await freshDb();const t=await tenant(db,'Tax Care');const rec=await t.mk('reception','Desk'),bill=await t.mk('billing','Biller'),ph=await t.mk('pharmacy','Chemist')
 const ist=new Date(Date.now()+330*60000).toISOString().slice(0,10)
 const p=await registerPatient(db,rec,{fullName:'Tax Patient',mobile:'9876501111',gender:'Female'})
 const med=await addMedicine(db,ph,{name:'Amoxicillin',strength:'500mg',form:'capsule',unitPrice:105,hsn:'30042011',gstRate:5})
 assert.equal(med.hsn_code,'30042011');assert.equal(Number(med.gst_rate),5)
 await assert.rejects(addMedicine(db,ph,{name:'X',unitPrice:1,gstRate:7}),(e:any)=>e.status===400)
 const svc=await addCatalogItem(db,t.admin,{code:'CONS',name:'Consultation',category:'consultation',price:500})
 assert.equal(svc.sac_code,'9993');assert.equal(Number(svc.gst_rate),0)
 const kit=await addCatalogItem(db,t.admin,{code:'KIT',name:'Dressing kit',category:'other',price:118,sac:'3005',gstRate:18})
 // a dispensed medicine line takes the medicine's HSN and rate through the trigger
 const rx=(await db.query("insert into prescriptions(hospital_id,patient_id,doctor_user_id) values($1,$2,$3) returning id",[t.admin.hospitalId,p.id,t.admin.userId])).rows[0]
 const di=(await db.query("insert into dispensed_items(hospital_id,prescription_id,patient_id,medicine_id,description,quantity,unit_price) values($1,$2,$3,$4,'Amoxicillin 500mg',2,105) returning id",[t.admin.hospitalId,rx.id,p.id,med.id])).rows[0]
 const inv=await createInvoice(db,bill,{patientId:p.id,items:[{serviceId:svc.id},{serviceId:kit.id}]})
 await db.query("insert into invoice_items(invoice_id,description,quantity,unit_price,source_type,source_id) values($1,'Amoxicillin 500mg',2,105,'dispense',$2)",[inv.id,di.id])
 const items=(await db.query('select description,hsn_sac,gst_rate::float r from invoice_items where invoice_id=$1 order by description',[inv.id])).rows
 assert.deepEqual(items.map((i:any)=>[i.hsn_sac,i.r]),[['30042011',5],['9993',0],['3005',18]])
 // no GSTIN yet: nothing is taxed
 assert.equal((await gstBreakup(db,inv.id)).totals.tax,0)
 await updateSettings(db,t.admin,{name:'Tax Care',gstin:'29ABCDE1234F1Z5',legalName:'Tax Care Pvt Ltd',city:'Bengaluru',pincode:'560001'})
 const st:any=await getSettings(db,t.admin);assert.equal(st.pincode??st.hospital?.pincode,'560001')
 let g=await gstBreakup(db,inv.id)
 assert.equal(g.totals.invoice,500+118+210);assert.equal(g.interState,false)
 const r5=g.byRate.find(r=>r.rate===5)!;assert.equal(r5.taxable,200);assert.equal(r5.cgst+r5.sgst,10)
 const r18=g.byRate.find(r=>r.rate===18)!;assert.equal(r18.taxable,100);assert.equal(r18.cgst,9);assert.equal(r18.sgst,9)
 assert.equal(g.byRate.find(r=>r.rate===0)!.taxable,500)
 // discount is shared across lines; totals still add up to the bill
 await setDiscount(db,bill,inv.id,{discount:82.8})
 g=await gstBreakup(db,inv.id);assert.equal(g.totals.invoice,745.2);assert.ok(Math.abs(g.totals.taxable+g.totals.tax-745.2)<0.02)
 // B2B buyer in another state -> IGST and an e-invoice
 await assert.rejects(setBuyer(db,bill,inv.id,{gstin:'BAD'}),(e:any)=>e.status===400)
 await assert.rejects(einvoiceJson(db,bill,inv.id),(e:any)=>e.status===409)
 await setBuyer(db,bill,inv.id,{gstin:'27AAACT2727Q1ZW',name:'Acme Insurance TPA',address:'Andheri, Mumbai',pincode:'400069'})
 g=await gstBreakup(db,inv.id);assert.equal(g.interState,true);assert.equal(g.totals.cgst,0);assert.ok(g.totals.igst>0)
 const j:any=await einvoiceJson(db,bill,inv.id)
 assert.equal(j.Version,'1.1');assert.equal(j.SellerDtls.Gstin,'29ABCDE1234F1Z5');assert.equal(j.BuyerDtls.Pos,'27');assert.equal(j.ItemList.length,3)
 assert.ok(Math.abs(j.ValDtls.AssVal+j.ValDtls.IgstVal+j.ValDtls.RndOffAmt-j.ValDtls.TotInvVal)<0.01)
 await assert.rejects(recordIrn(db,bill,inv.id,{irn:'short'}),(e:any)=>e.status===400)
 await recordIrn(db,bill,inv.id,{irn:'a'.repeat(64),ackNo:'112010000000001'})
 await assert.rejects(setBuyer(db,bill,inv.id,{gstin:''}),(e:any)=>e.status===409,'buyer locked once registered')
 const full:any=await getInvoice(db,bill,inv.id);assert.equal(full.invoice.irn,'a'.repeat(64));assert.ok(full.gst.totals.igst>0)
 assert.ok((await invoicePdf(full)).length>1000)
 // accounts exports
 await assert.rejects(tallyXml(db,rec,ist,ist),(e:any)=>e.status===403)
 const x=await tallyXml(db,bill,ist,ist)
 assert.match(x,/<VOUCHER VCHTYPE="Sales"/);assert.match(x,/Sales @5%/);assert.match(x,/IGST @18%/);assert.match(x,/Sales - Exempt/)
 const csv=await gstSummaryCsv(db,bill,ist,ist)
 assert.match(csv,/^Section,/);assert.match(csv,/B2B,.*27AAACT2727Q1ZW/);assert.match(csv,/HSN,30042011/)
 await assert.rejects(gstSummaryCsv(db,bill,'2026-02-01','2026-01-01'),(e:any)=>e.status===400)
})
