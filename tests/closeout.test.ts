import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {checkIn} from '../lib/services/opd'
import {createInvoice,recordPayment} from '../lib/services/billing'
import {closeoutReport,closeoutSettings,sendCloseout,closeoutDue,closeoutText} from '../lib/services/closeout'
import {runOutbox} from '../lib/services/notify'
import {today} from '../lib/services/core'
import {istToUtc} from '../lib/services/schedule'
test('close-out: figures, settings validation, dry-run send, dedupe, schedule',async()=>{const db=await freshDb();const {h,admin,mk}=await tenant(db,'Close Hosp');const rec=await mk('reception','R C'),doc=await mk('doctor','Dr C'),bill=await mk('billing','B C')
 const p=await registerPatient(db,rec,{fullName:'Day Pt',mobile:'9876500441'});await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId})
 const inv=await createInvoice(db,bill,{patientId:p.id,items:[{description:'Consult',unitPrice:500},{description:'CBC',unitPrice:300}]});const iid=inv.id||inv.invoice?.id;await recordPayment(db,bill,iid,{amount:600,mode:'upi'})
 const r=await closeoutReport(db,h.hospitalId);assert.equal(r.patients.new,1);assert.equal(r.opd.visits,1);assert.equal(r.money.billed,800);assert.equal(r.money.collected,600);assert.equal(r.money.outstanding,200);assert.equal(r.money.byMode[0].mode,'upi');assert.equal(r.opd.byDoctor[0].doctor,'Dr C')
 assert.match(closeoutText('Close Hosp',r),/Collected ₹600 \(upi ₹600\)/)
 await assert.rejects(closeoutSettings(db,rec,{}),(e:any)=>e.status===403);await assert.rejects(closeoutSettings(db,admin,{emails:'bad'}),(e:any)=>e.status===400);await assert.rejects(closeoutSettings(db,admin,{time:'9pm'}),(e:any)=>e.status===400)
 await closeoutSettings(db,admin,{enabled:true,emails:'owner@x.in, acct@x.in',whatsapp:'9876500000',time:'21:00'})
 const s=await sendCloseout(db,h.hospitalId);assert.equal(s.queued,3);assert.equal((await sendCloseout(db,h.hospitalId)).queued,0)
 const off=(ch:any)=>({channel:ch,name:'off',configured:()=>false,async send(){throw new Error('x')}}) as any
 const o=await runOutbox(db,{whatsapp:off('whatsapp'),email:off('email'),sms:off('sms')});assert.equal(o.not_sent,3)
 // schedule: before 21:00 IST nothing for today (yesterday is skipped: hospital created today)
 await db.query('delete from closeout_reports');await db.query("delete from notification_outbox where kind='closeout'")
 assert.equal((await closeoutDue(db,istToUtc(today(),20*60))).closeouts,0);assert.equal((await closeoutDue(db,istToUtc(today(),21*60+5))).closeouts,1);assert.equal((await closeoutDue(db,istToUtc(today(),22*60))).closeouts,0)})
