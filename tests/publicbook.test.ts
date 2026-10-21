import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {bookingInfo,publicBook} from '../lib/services/publicbook'
import {saveWeek,addLeave} from '../lib/services/doctorsched'
test('public booking: off by default, provisional patient, respects schedule/leave, rate-limited, no double-booking',async()=>{const db=await freshDb();const t=await tenant(db,'Book Care');const doc=await t.mk('doctor','Dr Book');const code=(await db.query('select code from hospitals where id=$1',[t.admin.hospitalId])).rows[0].code
 await assert.rejects(bookingInfo(db,code),/not available/)
 await db.query('update hospitals set public_booking_enabled=true,notify_whatsapp=true where id=$1',[t.admin.hospitalId])
 const all=[0,1,2,3,4,5,6].map(d=>({day:d,start:'09:00',end:'12:00',slotMinutes:15}));await saveWeek(db,t.admin,doc.userId,all)
 const day=new Date(Date.now()+330*60000+2*864e5).toISOString().slice(0,10)
 const i=await bookingInfo(db,code,doc.userId,day);assert.ok(i.doctors.some((d:any)=>d.id===doc.userId));assert.equal(i.slots.length,12)
 const r=await publicBook(db,code,{name:'Kiran Rao',mobile:'9811100001',doctorId:doc.userId,at:i.slots[0].at,mode:'in_person',consent:true});assert.equal(r.newPatient,true);assert.equal(r.notified,true);assert.match(r.portal,/\/portal\//)
 assert.equal((await db.query('select provisional from patients where mobile=$1',['+919811100001'])).rows[0]?.provisional,true)
 await assert.rejects(publicBook(db,code,{name:'Other',mobile:'9811100002',doctorId:doc.userId,at:i.slots[0].at}),/taken|unavailable/)
 const v=await publicBook(db,code,{name:'Kiran Rao',mobile:'9811100001',doctorId:doc.userId,at:i.slots[1].at,mode:'video'});assert.equal(v.newPatient,false);assert.equal(v.videoPending,true)
 await publicBook(db,code,{name:'Kiran Rao',mobile:'9811100001',doctorId:doc.userId,at:i.slots[2].at});await assert.rejects(publicBook(db,code,{name:'Kiran Rao',mobile:'9811100001',doctorId:doc.userId,at:i.slots[3].at}),/Too many/)
 await addLeave(db,t.admin,doc.userId,{startDate:day,endDate:day,reason:'Conference'});assert.equal((await bookingInfo(db,code,doc.userId,day)).slots.length,0)
 await assert.rejects(publicBook(db,code,{name:'Xavier',mobile:'123',doctorId:doc.userId,at:i.slots[5].at}),/mobile/)})
