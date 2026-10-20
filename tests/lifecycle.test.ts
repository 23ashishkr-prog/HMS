import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {runLifecycle,lifecycleView} from '../lib/services/lifecycle';import {getSubscription,applyProviderEvent} from '../lib/services/tenancy'
import {registerPatient} from '../lib/services/patients';import {checkIn,startEncounter,recordVitals,prescribe} from '../lib/services/opd';import {createInvoice} from '../lib/services/billing'
const DAY=86400000,at=(ms:number)=>new Date(Date.now()+ms)
test('lifecycle: 2-month trial → warnings → on hold → resubscribe → hold → purge keeps name/phone/address', async()=>{
 const db=await freshDb();const {admin,mk,h}=await tenant(db,'Life Clinic','pro');const rec=await mk('reception','R'),doc=await mk('doctor','Dr L')
 let s=await getSubscription(db,admin.hospitalId);assert.equal(s.status,'trialing');const days=Math.round((new Date(s.trial_ends_at).getTime()-Date.now())/DAY);assert.ok(days>=58&&days<=62,'trial ≈ 2 months, got '+days)
 const p=await registerPatient(db,rec,{fullName:'Keep Me',mobile:'9811122233',address:'12 MG Road',gender:'Female',allergies:'Penicillin',abhaNumber:'11112222333344'})
 const t=await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId});const e=await startEncounter(db,doc,{queueId:t.id});await recordVitals(db,doc,{encounterId:e.id,pulse:80});await prescribe(db,doc,{encounterId:e.id,items:[{medicine:'X'}]});await createInvoice(db,rec,{patientId:p.id})
 const end=new Date(s.trial_ends_at).getTime()
 let r=await runLifecycle(db,new Date(end-6*DAY));assert.equal(r.held,0);const n=(await db.query('select kind,days_left from lifecycle_notices order by days_left')).rows;assert.deepEqual(n.map(x=>x.days_left),[7,30])
 await runLifecycle(db,new Date(end-6*DAY));assert.equal((await db.query('select count(*)::int n from lifecycle_notices')).rows[0].n,2,'idempotent notices')
 r=await runLifecycle(db,new Date(end+DAY));assert.equal(r.held,1);s=await getSubscription(db,admin.hospitalId);assert.equal(s.status,'on_hold');assert.equal(s.usable,false)
 assert.equal((await runLifecycle(db,new Date(end+2*DAY))).held,0,'idempotent hold')
 await applyProviderEvent(db,admin.hospitalId,{type:'subscription.activated'},{});s=await getSubscription(db,admin.hospitalId);assert.equal(s.usable,true);assert.equal(s.hold_started_at,null)
 assert.equal((await db.query('select count(*)::int n from encounters')).rows[0].n,1,'data intact after resume')
 await applyProviderEvent(db,admin.hospitalId,{type:'subscription.halted'},{});const t0=Date.now();await runLifecycle(db,new Date(t0));s=await getSubscription(db,admin.hospitalId);assert.equal(s.status,'on_hold')
 const pAt=lifecycleView(s)!.purgeAt!.getTime();assert.ok(Math.abs(pAt-(t0+182*DAY))<5*DAY)
 assert.equal((await runLifecycle(db,new Date(pAt-DAY))).purged,0)
 assert.equal((await runLifecycle(db,new Date(pAt+DAY))).purged,1);assert.equal((await runLifecycle(db,new Date(pAt+2*DAY))).purged,0,'idempotent purge')
 const kept=(await db.query('select * from patients where hospital_id=$1',[h.hospitalId])).rows;assert.equal(kept.length,1);assert.equal(kept[0].full_name,'Keep Me');assert.equal(kept[0].mobile,'+919811122233');assert.equal(kept[0].address,'12 MG Road');assert.equal(kept[0].allergies,null);assert.equal(kept[0].abha_number,null);assert.equal(kept[0].gender,null)
 for(const t of ['encounters','vitals','prescriptions','invoices','doctor_queue','patient_assignments'])assert.equal((await db.query(`select count(*)::int n from ${t} where hospital_id=$1`,[h.hospitalId])).rows[0].n,0,t)
 const users=(await db.query('select role,active from users where hospital_id=$1',[h.hospitalId])).rows;assert.equal(users.filter(u=>u.active).length,1);assert.equal(users.find(u=>u.active).role,'admin')
})
test('lifecycle only touches the expired tenant', async()=>{const db=await freshDb();const A=await tenant(db,'Alpha Exp','pro'),B=await tenant(db,'Beta Ok','pro');await db.query("update subscriptions set trial_ends_at=now()-interval '1 day' where hospital_id=$1",[A.admin.hospitalId]);await runLifecycle(db);assert.equal((await getSubscription(db,A.admin.hospitalId)).status,'on_hold');assert.equal((await getSubscription(db,B.admin.hospitalId)).status,'trialing')})
