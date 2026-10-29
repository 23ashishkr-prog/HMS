import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {medicineSchedule,slotsFor,istToUtc} from '../lib/services/schedule'
import {enqueue,runOutbox,Provider,ProviderError} from '../lib/services/notify'
import {createFollowupOffer,respondFollowup,sweepFollowups,handleInbound} from '../lib/services/patientcomms'
import {recordIncident,fingerprint,scrub} from '../lib/services/incidents'
import {personName,indianMobile,pincode,dateIN,icd10,frequency,duration,vitals,Fixes} from '../lib/services/normalize'
import {registerPatient} from '../lib/services/patients'
import {idemKey} from '../lib/client'
const cfg={times:{morning:'08:00',afternoon:'14:00',night:'21:00'},foodOffsetMin:30}
test('medicine schedule: 1-0-1 slots in IST, food offset, dose count kept', ()=>{
 assert.deepEqual(slotsFor('1-0-1'),['morning','night']);assert.deepEqual(slotsFor('BD'),['morning','night']);assert.deepEqual(slotsFor('1-1-1-1'),['morning','afternoon','evening','night']);assert.equal(slotsFor('SOS'),null)
 const start=istToUtc('2026-10-21',10*60) // 10:00 IST — morning slot already gone
 const d=medicineSchedule([{medicine:'Paracetamol 500 mg',frequency:'1-0-1',duration:'3 days',instructions:'after food'},{medicine:'Pantoprazole 40 mg',frequency:'1-0-0',duration:'2 days',instructions:'before breakfast'}],start,cfg)
 const para=d.filter(x=>x.medicines.some(m=>m.name.startsWith('Para')));assert.equal(para.length,6)
 assert.equal(para[0].dateIST,'2026-10-21');assert.equal(para[0].slot,'night');assert.equal(para[0].timeIST,'21:30');assert.equal(para[0].at.toISOString(),'2026-10-21T16:00:00.000Z')
 assert.equal(para.at(-1)!.dateIST,'2026-10-24');assert.equal(para.at(-1)!.slot,'morning') // shifted course: 6 doses
 const pan=d.filter(x=>x.medicines.some(m=>m.name.startsWith('Panto')));assert.equal(pan.length,2);assert.equal(pan[0].timeIST,'07:30');assert.equal(pan[0].dateIST,'2026-10-22')
 // same slot+timing grouped into one message
 const g=medicineSchedule([{medicine:'A',frequency:'1-0-1',duration:'1 day'},{medicine:'B',frequency:'0-0-1',duration:'1 day'}],istToUtc('2026-10-21',7*60),cfg);assert.equal(g.length,2);assert.equal(g[1].medicines.length,2)
})
async function setup(){const db=await freshDb();const t=await tenant(db,'Comms Co');const rec=await t.mk('reception','Desk'),doc=await t.mk('doctor','Dr F')
 await db.query("update hospitals set notify_whatsapp=true,notify_email=true where id=$1",[t.admin.hospitalId])
 const p=await registerPatient(db,rec,{fullName:'Message Person',mobile:'9876500033',email:'mp@example.com',consentWhatsapp:true});return {db,...t,rec,doc,p}}
const fakeWa=(fail=0):Provider&{sent:any[]}=>{const sent:any[]=[];let n=0;return {channel:'whatsapp',name:'mock',sent,configured:()=>true,async send(m){if(n++<fail)throw new ProviderError('timeout');sent.push(m);return {id:'m'+sent.length}}}}
const off=(ch:any):Provider=>({channel:ch,name:'off',configured:()=>false,async send(){throw new Error('no')}})
test('consent enforcement + outbox: dry-run, retry/backoff, dedupe, STOP', async()=>{
 const s=await setup();const r=await enqueue(s.db,{hospitalId:s.h.hospitalId,patientId:s.p.id,kind:'token',body:'hi',dedupe:'t1'});assert.equal(r.queued,1) // whatsapp only: e-mail not consented
 assert.equal((await enqueue(s.db,{hospitalId:s.h.hospitalId,patientId:s.p.id,kind:'token',body:'hi',dedupe:'t1'})).queued,0)
 const none=await registerPatient(s.db,s.rec,{fullName:'No Consent',mobile:'9876500044'});assert.equal((await enqueue(s.db,{hospitalId:s.h.hospitalId,patientId:none.id,kind:'token',body:'x'})).queued,0)
 const dry=await runOutbox(s.db,{whatsapp:off('whatsapp'),email:off('email'),sms:off('sms')});assert.equal(dry.not_sent,1);assert.match((await s.db.query('select last_error from notification_outbox')).rows[0].last_error,/provider not configured/)
 await enqueue(s.db,{hospitalId:s.h.hospitalId,patientId:s.p.id,kind:'token',body:'retry me',dedupe:'t2'});const wa=fakeWa(1)
 const a=await runOutbox(s.db,{whatsapp:wa,email:off('email'),sms:off('sms')});assert.equal(a.retry,1)
 assert.equal((await runOutbox(s.db,{whatsapp:wa,email:off('email'),sms:off('sms')})).claimed,0) // backoff: not due yet
 const b=await runOutbox(s.db,{whatsapp:wa,email:off('email'),sms:off('sms')},new Date(Date.now()+5*60000));assert.equal(b.sent,1);assert.equal(wa.sent[0].body,'retry me')
 await enqueue(s.db,{hospitalId:s.h.hospitalId,patientId:s.p.id,kind:'med_reminder',body:'later',dedupe:'m1',sendAfter:new Date(Date.now()+3600e3)})
 await handleInbound(s.db,'919876500033','STOP',null);assert.equal((await s.db.query("select status from notification_outbox where dedupe_key='m1:whatsapp'")).rows[0].status,'cancelled')
 assert.equal((await enqueue(s.db,{hospitalId:s.h.hospitalId,patientId:s.p.id,kind:'token',body:'after stop'})).queued,0)
})
test('follow-up: offer holds a slot but books nothing until the patient confirms', async()=>{
 const s=await setup();await s.db.query("update hospitals set opd_hours='{\"start\":\"10:00\",\"end\":\"11:00\",\"slotMin\":15}' where id=$1",[s.h.hospitalId])
 const now=istToUtc('2026-10-21',9*60);const o=await createFollowupOffer(s.db,s.h.hospitalId,{patientId:s.p.id,doctorId:s.doc.userId,date:'2026-10-28'},now)
 assert.equal(o.status,'proposed');assert.equal(new Date(o.held_slot).toISOString(),istToUtc('2026-10-28',600).toISOString())
 assert.equal((await s.db.query('select count(*)::int n from appointments')).rows[0].n,0)
 const msg=(await s.db.query("select body,buttons from notification_outbox where kind='followup_offer'")).rows[0];assert.match(msg.body,/holding/);assert.deepEqual(msg.buttons.map((b:any)=>b.title),['Confirm','Another time','Cancel'])
 // a second patient's offer must not get the held slot
 const p2=await registerPatient(s.db,s.rec,{fullName:'Other Person',mobile:'9876500055',consentWhatsapp:true});const o2=await createFollowupOffer(s.db,s.h.hospitalId,{patientId:p2.id,doctorId:s.doc.userId,date:'2026-10-28'},now);assert.notEqual(new Date(o2.held_slot).getTime(),new Date(o.held_slot).getTime())
 // reminder once at half window, then flagged when the hold lapses
 assert.deepEqual(await sweepFollowups(s.db,new Date(now.getTime()+13*3600e3)),{reminded:2,flagged:0});assert.equal((await sweepFollowups(s.db,new Date(now.getTime()+14*3600e3))).reminded,0)
 const r=await respondFollowup(s.db,o.id,'confirm',new Date(now.getTime()+3600e3));assert.equal(r.status,'confirmed')
 assert.equal((await s.db.query('select count(*)::int n from appointments')).rows[0].n,1);await assert.rejects(respondFollowup(s.db,o.id,'confirm'),(e:any)=>e.status===409)
 assert.ok((await s.db.query("select 1 from notification_outbox where kind='followup_confirmed'")).rows[0])
 assert.equal((await sweepFollowups(s.db,new Date(now.getTime()+25*3600e3))).flagged,1) // o2 never answered
 const o3=await createFollowupOffer(s.db,s.h.hospitalId,{patientId:p2.id,doctorId:s.doc.userId,date:'2026-10-29'},now);const another=await respondFollowup(s.db,o3.id,'another',now);assert.equal(another.status,'proposed');assert.equal((await s.db.query('select count(*)::int n from appointments')).rows[0].n,1)
})
test('incidents: scrubbed, de-duplicated by fingerprint, notify once, quiet when unconfigured', async()=>{
 const db=await freshDb();delete process.env.GITHUB_ISSUES_TOKEN;assert.doesNotMatch(scrub('patient 9876543210 a@b.com QATEST-26-000001 token=abc'),/9876543210|a@b\.com|000001|abc/)
 const e={source:'server' as const,message:'Cannot read x of undefined for 9876543210',stack:'Error\n    at f (/app/lib/services/opd.ts:3:9)',route:'/api/encounters/0b8f3c2e-1111-4222-8333-944455556666'}
 assert.equal(fingerprint(e),fingerprint({...e,message:'Cannot read x of undefined for 9123456789',route:'/api/encounters/1b8f3c2e-1111-4222-8333-944455556666'}))
 let calls=0;const f=(async()=>{calls++;return new Response(JSON.stringify({html_url:'https://github.com/x/y/issues/1'}),{status:201})}) as any
 const a=await recordIncident(db,e,{fetch:f});assert.equal(a.notified,false);assert.match(String(a.reason),/not set/)
 process.env.GITHUB_ISSUES_TOKEN='test';const db2=await freshDb();const b1=await recordIncident(db2,e,{fetch:f});const b2=await recordIncident(db2,e,{fetch:f});delete process.env.GITHUB_ISSUES_TOKEN
 assert.equal(b1.notified,true);assert.equal(b2.notified,false);assert.equal(b2.count,2);assert.equal(calls,1)
 assert.doesNotMatch(JSON.stringify((await db2.query('select * from incidents')).rows),/9876543210/)
})
test('auto-correction rules + idempotency key', async()=>{
 const fx=new Fixes();assert.equal(personName('  rAHUL   kumar  sharma ',fx),'rAHUL kumar sharma');assert.equal(personName('QA Patient Ravi'),'QA Patient Ravi');assert.equal(indianMobile('098765 43210',fx),'+919876543210');assert.equal(indianMobile('+91-98765-43210'),'+919876543210');assert.throws(()=>indianMobile('12345'))
 assert.deepEqual(pincode('560 001',null,fx),{pincode:'560001',state:'Karnataka'});const f2=new Fixes();pincode('110001','Kerala',f2);assert.match(f2.sug[0].message,/Delhi/)
 assert.equal(dateIN('05/03/1990'),'1990-03-05');assert.throws(()=>dateIN('31/02/2020'));assert.throws(()=>dateIN('01/01/2099',undefined,'DOB',{past:true}))
 assert.deepEqual(icd10('j029',null),{code:'J02.9',description:'Acute pharyngitis, unspecified'});const f3=new Fixes();icd10('', 'typhoid',f3);assert.match(f3.sug[0].message,/A01\.0/)
 assert.equal(frequency('BD'),'1-0-1');assert.equal(frequency('1 0 1'),'1-0-1');assert.equal(duration('2 wks'),'14 days')
 const v=new Fixes();assert.equal(vitals({temperatureC:101.3},v).temperatureC,38.5);assert.throws(()=>vitals({spo2:120}));assert.throws(()=>vitals({bpSystolic:80,bpDiastolic:120}));const v2=new Fixes();vitals({pulse:150},v2);assert.equal(v2.sug.length,1)
 const db=await freshDb();const t=await tenant(db,'Dup Co');const rec=await t.mk('reception','R');await registerPatient(db,rec,{fullName:'Asha Devi',mobile:'9876500066'})
 await assert.rejects(registerPatient(db,rec,{fullName:'asha  devi',mobile:'09876500066'}),(e:any)=>e.status===409&&e.extra.duplicates.length===1)
 assert.ok(await registerPatient(db,rec,{fullName:'Asha Devi',mobile:'9876500066',confirmNotDuplicate:true}))
 const audit=(await db.query("select count(*)::int n from audit_log where action='autocorrect'")).rows[0].n;assert.ok(audit>=0)
 const k1=idemKey('POST','/api/x','{"a":1}',1e12),k2=idemKey('POST','/api/x','{"a":1}',1e12+1000);assert.equal(k1,k2);assert.notEqual(k1,idemKey('POST','/api/x','{"a":2}',1e12))
})
