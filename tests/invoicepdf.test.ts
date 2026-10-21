import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {frontDeskVisit} from '../lib/services/flows';import {addCatalogItem} from '../lib/services/diagnostics'
import {invoiceLink,publicInvoicePdf,staffInvoicePdf} from '../lib/services/invoicepdf'
process.env.SESSION_SECRET=process.env.SESSION_SECRET||'test-session'
test('registration collects consultation fee, makes a GST-ready PDF and queues it on WhatsApp when consented',async()=>{const db=await freshDb();const t=await tenant(db,'Fee Care');const rec=await t.mk('reception','Rani Desk');const doc=await t.mk('doctor','Dr Dev')
 await addCatalogItem(db,t.admin,{code:'OPD',name:'Consultation',category:'consultation',price:500})
 await db.query('update hospitals set notify_whatsapp=true where id=$1',[t.admin.hospitalId])
 const x:any=await frontDeskVisit(db,rec,{patient:{fullName:'Asha Verma',mobile:'9876543210',gender:'Female',ageYears:30,consentWhatsapp:true,consent:{whatsapp:true}},doctorId:doc.userId,collectMode:'upi',reference:'UPI123'}).catch(e=>({err:e.message}))
 assert.ok(x.bill?.invoiceId,'invoice created '+JSON.stringify(x).slice(0,300));assert.equal(x.bill.balance,0);assert.match(x.bill.pdfUrl,/\/pdf$/)
 const pdf=await staffInvoicePdf(db,rec,x.bill.invoiceId);assert.equal(Buffer.from(pdf.slice(0,5)).toString(),'%PDF-');assert.ok(pdf.length>1500)
 const u=new URL(invoiceLink(x.bill.invoiceId));const ok=await publicInvoicePdf(db,x.bill.invoiceId,Number(u.searchParams.get('e')),u.searchParams.get('s')!);assert.equal(Buffer.from(ok.slice(0,4)).toString(),'%PDF')
 await assert.rejects(publicInvoicePdf(db,x.bill.invoiceId,Number(u.searchParams.get('e')),'forged'),/invalid/);await assert.rejects(publicInvoicePdf(db,x.bill.invoiceId,Date.now()-1,u.searchParams.get('s')!),/invalid|expired/)
 const other=await tenant(db,'Other Care');await assert.rejects(staffInvoicePdf(db,other.admin,x.bill.invoiceId),/not found/i)
 const ob=(await db.query("select channel,body from notification_outbox where kind='receipt' and patient_id=$1",[x.patient.id])).rows;assert.ok(x.bill.sent?.queued>0,JSON.stringify(x.bill.sent));{assert.ok(ob.some(o=>o.channel==='whatsapp'&&/Download invoice/.test(o.body)&&/api\/public\/invoice/.test(o.body)))}})
