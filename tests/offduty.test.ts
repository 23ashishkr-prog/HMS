import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {frontDeskVisit} from '../lib/services/flows'
import {doctorStatuses,nextFreeSlot,istToUtc} from '../lib/services/doctorsched'
import {listQueue} from '../lib/services/opd'

test('off-duty doctor: next free time skips bookings and leave', async()=>{
 const db=await freshDb();const t=await tenant(db,'Slot Clinic');const doc=await t.mk('doctor','Dr Slot');const hid=t.admin.hospitalId
 // Tuesdays 10:00-12:00, 30-minute slots. 2026-10-27 is a Tuesday.
 await db.query("insert into doctor_availability(hospital_id,doctor_user_id,day_of_week,start_time,end_time,slot_minutes,active) values($1,$2,2,'10:00','12:00',30,true)",[hid,doc.userId])
 const now=istToUtc('2026-10-27',8*60)
 const st=(await doctorStatuses(db,hid,now)).find(d=>d.id===doc.userId)!
 assert.equal(st.status,'off_duty');assert.equal(st.nextFree,istToUtc('2026-10-27',600).toISOString())
 const p=(await db.query("insert into patients(hospital_id,uhid,full_name) values($1,'U-1','Booked One') returning id",[hid])).rows[0].id
 await db.query("insert into appointments(hospital_id,patient_id,doctor_user_id,scheduled_at,status) values($1,$2,$3,$4,'scheduled')",[hid,p,doc.userId,istToUtc('2026-10-27',600)])
 assert.equal((await nextFreeSlot(db,hid,doc.userId,now))!.toISOString(),istToUtc('2026-10-27',630).toISOString())
 await db.query("insert into doctor_time_off(hospital_id,doctor_user_id,start_at,end_at,reason,created_by) values($1,$2,$3,$4,'Conference',$5)",[hid,doc.userId,istToUtc('2026-10-27',0),istToUtc('2026-10-28',0),t.admin.userId])
 assert.equal((await nextFreeSlot(db,hid,doc.userId,now))!.toISOString(),istToUtc('2026-11-03',600).toISOString())
 const leave=(await doctorStatuses(db,hid,istToUtc('2026-10-27',11*60))).find(d=>d.id===doc.userId)!
 assert.equal(leave.status,'on_leave');assert.equal(leave.nextFree,istToUtc('2026-11-03',600).toISOString())
})

test('front desk gives no walk-in token when the doctor is not in; it books the next free time instead', async()=>{
 const db=await freshDb();const t=await tenant(db,'Away Clinic');const rec=await t.mk('reception','Desk');const doc=await t.mk('doctor','Dr Away');const hid=t.admin.hospitalId
 await db.query('update users set online=false where id=$1',[doc.userId])
 const pt={fullName:'Late Comer',mobile:'9876501234',gender:'Female'}
 const err:any=await frontDeskVisit(db,rec,{patient:pt,doctorId:doc.userId}).catch(e=>e)
 assert.equal(err.status,409);assert.equal(err.extra.code,'doctor_unavailable');assert.ok(err.extra.nextFree);assert.match(err.message,/Next available time/)
 assert.equal((await db.query("select count(*)::int n from patients where hospital_id=$1",[hid])).rows[0].n,0,'nothing registered on a refused walk-in')
 const v:any=await frontDeskVisit(db,rec,{patient:pt,doctorId:doc.userId,scheduleAt:err.extra.nextFree})
 assert.equal(v.token,undefined);assert.equal(v.appointment.scheduledAt,err.extra.nextFree);assert.equal(v.appointment.doctor,'Dr Away')
 assert.equal((await listQueue(db,rec)).length,0,'no queue token')
 const ap=(await db.query('select status,source from appointments where id=$1',[v.appointment.id])).rows[0];assert.equal(ap.status,'scheduled');assert.equal(ap.source,'staff')
 const st=(await doctorStatuses(db,hid)).find(d=>d.id===doc.userId)!;assert.notEqual(st.nextFree,err.extra.nextFree,'booked slot is no longer offered')
 const past:any=await frontDeskVisit(db,rec,{patientId:v.patient.id,doctorId:doc.userId,scheduleAt:new Date(Date.now()-3600000).toISOString()}).catch(e=>e);assert.equal(past.status,400)
 // back in OPD: normal token again
 await db.query('update users set online=true where id=$1',[doc.userId])
 const w:any=await frontDeskVisit(db,rec,{patientId:v.patient.id,doctorId:doc.userId});assert.equal(w.token.token_no,1)
})
