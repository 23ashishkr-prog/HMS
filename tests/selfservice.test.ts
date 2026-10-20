import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {selfCheckIn,checkinInfo,selfServiceSettings} from '../lib/services/selfservice'
import {handleInbound} from '../lib/services/patientcomms'
import {istToUtc} from '../lib/services/schedule'
import {today} from '../lib/services/core'
async function setup(){const db=await freshDb();const t=await tenant(db,'Self Svc');const rec=await t.mk('reception','Desk S'),doc=await t.mk('doctor','Dr Self')
 await db.query("update hospitals set notify_whatsapp=true where id=$1",[t.h.hospitalId])
 const p=await registerPatient(db,rec,{fullName:'Kiosk User',mobile:'9876500777',dateOfBirth:'1990-05-04',consentWhatsapp:true});const h=(await db.query('select code,checkin_key from hospitals where id=$1',[t.h.hospitalId])).rows[0];return {db,...t,rec,doc,p,code:h.code,key:h.checkin_key}}
test('QR self check-in: disabled by default, wrong key, identity, appointment, walk-in, idempotent, rate limit',async()=>{const s=await setup()
 await assert.rejects(checkinInfo(s.db,s.code,s.key),(e:any)=>e.status===404)
 await selfServiceSettings(s.db,s.admin,{selfCheckin:true});await assert.rejects(checkinInfo(s.db,s.code,'bad'),(e:any)=>e.status===404)
 assert.equal((await checkinInfo(s.db,s.code,s.key)).doctors.length,1)
 await assert.rejects(selfCheckIn(s.db,s.code,s.key,{mobile:'9876500777',dob:'1991-01-01'}),(e:any)=>e.status===404)
 const w:any=await selfCheckIn(s.db,s.code,s.key,{mobile:'9876500777',dob:'1990-05-04'});assert.equal(w.needDoctor,true)
 const r:any=await selfCheckIn(s.db,s.code,s.key,{mobile:'+91 98765 00777',dob:'1990-05-04',doctorId:s.doc.userId});assert.equal(r.token,1);assert.equal(r.ahead,0)
 const again:any=await selfCheckIn(s.db,s.code,s.key,{mobile:'9876500777',dob:'1990-05-04',doctorId:s.doc.userId});assert.equal(again.already,true);assert.equal(again.token,1)
 assert.equal((await s.db.query("select count(*)::int n from audit_log where action='self_check_in'")).rows[0].n,1)
 for(let i=0;i<5;i++)await selfCheckIn(s.db,s.code,s.key,{mobile:'9876500999',dob:'2000-01-01'}).catch(()=>{});await assert.rejects(selfCheckIn(s.db,s.code,s.key,{mobile:'9876500999',dob:'2000-01-01'}),(e:any)=>e.status===429)})
test('QR self check-in uses today\'s appointment doctor; key rotation invalidates old QR',async()=>{const s=await setup();await selfServiceSettings(s.db,s.admin,{selfCheckin:true})
 await s.db.query("insert into appointments(hospital_id,patient_id,doctor_user_id,scheduled_at) values($1,$2,$3,$4)",[s.h.hospitalId,s.p.id,s.doc.userId,istToUtc(today(),23*60)])
 const r:any=await selfCheckIn(s.db,s.code,s.key,{mobile:'9876500777',uhid:s.p.uhid});assert.equal(r.appointment,true);assert.equal((await s.db.query("select status from appointments")).rows[0].status,'checked_in')
 const n:any=await selfServiceSettings(s.db,s.admin,{rotateKey:true});assert.notEqual(n.key,s.key);await assert.rejects(checkinInfo(s.db,s.code,s.key),(e:any)=>e.status===404)
 await assert.rejects(selfServiceSettings(s.db,s.rec,{selfCheckin:false}),(e:any)=>e.status===403)})
test('WhatsApp BOOK: off by default, offers 3 slots, booking a slot, taken slot',async()=>{const s=await setup();const now=new Date(istToUtc(today(),8*60).getTime())
 assert.deepEqual(await handleInbound(s.db,'919876500777','book',null,now),['book: not enabled'])
 await selfServiceSettings(s.db,s.admin,{whatsappBooking:true});const r=await handleInbound(s.db,'919876500777','BOOK',null,now);assert.deepEqual(r,['book: offered 3'])
 const o=(await s.db.query("select buttons from notification_outbox where kind='booking' order by created_at desc limit 1")).rows[0];const btn=(typeof o.buttons==='string'?JSON.parse(o.buttons):o.buttons)[0];assert.match(btn.id,/^BK:/);assert.ok(btn.title.length<=20)
 assert.deepEqual(await handleInbound(s.db,'919876500777',null,btn.id,now),['booked']);const a=(await s.db.query('select status,scheduled_at from appointments')).rows;assert.equal(a.length,1)
 assert.deepEqual(await handleInbound(s.db,'919876500777',null,btn.id,now),['book: slot gone'])})
