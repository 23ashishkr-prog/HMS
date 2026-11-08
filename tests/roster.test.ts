import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {roster,saveShifts,addStaffLeave,deleteStaffLeave} from '../lib/services/roster'
import {checkBookable,istToUtc} from '../lib/services/doctorsched'

test('staff roster: shifts for every role, overnight shifts, leave, and who is in now', async()=>{
 const db=await freshDb();const t=await tenant(db,'Roster Care');const nurse=await t.mk('nurse','Nurse Asha'),nurse2=await t.mk('nurse','Nurse Bina'),doc=await t.mk('doctor','Dr Roy'),lab=await t.mk('lab','Lab Tech')
 // Wednesday 2026-11-11, 22:30 IST
 const now=istToUtc('2026-11-11',22*60+30)
 await saveShifts(db,t.admin,nurse.userId,[3,4].map(day=>({day,shift:'Night',start:'20:00',end:'08:00'})))
 await saveShifts(db,t.admin,nurse2.userId,[{day:3,shift:'Morning',start:'08:00',end:'14:00'},{day:4,shift:'Morning',start:'08:00',end:'14:00'}])
 await saveShifts(db,t.admin,doc.userId,[{day:3,start:'10:00',end:'13:00',slotMinutes:15,shift:'OPD'}])
 // overlapping shifts and same start/end are refused; only admin edits a nurse's roster
 await assert.rejects(saveShifts(db,t.admin,nurse2.userId,[{day:3,start:'08:00',end:'14:00'},{day:3,start:'13:00',end:'16:00'}]),(e:any)=>e.status===400)
 await assert.rejects(saveShifts(db,t.admin,nurse2.userId,[{day:2,start:'20:00',end:'09:00'},{day:3,start:'08:00',end:'14:00'}]),(e:any)=>e.status===400,'overnight spill overlaps next morning')
 await assert.rejects(saveShifts(db,nurse,nurse.userId,[]),(e:any)=>e.status===403)
 await addStaffLeave(db,t.admin,lab.userId,{startDate:'2026-11-10',endDate:'2026-11-12',leaveType:'sick'})
 await assert.rejects(addStaffLeave(db,t.admin,lab.userId,{startDate:'2026-11-10',leaveType:'vacation'}),(e:any)=>e.status===400)
 let r:any=await roster(db,nurse,{now});const s=(id:string)=>r.staff.find((x:any)=>x.id===id)
 assert.equal(s(nurse.userId).status,'on_duty');assert.match(s(nurse.userId).shiftNow.label,/Night 20:00–08:00/)
 assert.equal(s(nurse2.userId).status,'off_duty');assert.match(s(nurse2.userId).next.label,/Morning/)
 assert.equal(s(lab.userId).status,'on_leave');assert.equal(s(lab.userId).leave.type,'sick')
 assert.equal(s(doc.userId).status,'off_duty');assert.equal(s(t.admin.userId).status,'no_roster')
 // 06:00 next day: the night shift still running from yesterday
 r=await roster(db,t.admin,{now:istToUtc('2026-11-12',6*60)});assert.equal(s(nurse.userId).status,'on_duty');assert.equal(s(nurse2.userId).status,'off_duty')
 // filter by role
 r=await roster(db,t.admin,{role:'nurse',now});assert.deepEqual(r.staff.map((x:any)=>x.role),['nurse','nurse']);assert.equal(r.counts.nurse,2)
 // doctors: roster drives OPD booking as before, and leave blocks booking
 const lv=await addStaffLeave(db,t.admin,doc.userId,{startDate:'2026-11-18',leaveType:'training'})
 assert.ok(await checkBookable(db,t.admin.hospitalId,doc.userId,istToUtc('2026-11-18',10*60+30)))
 assert.equal(await checkBookable(db,t.admin.hospitalId,doc.userId,istToUtc('2026-11-25',10*60+30)),null)
 await deleteStaffLeave(db,t.admin,lv.id)
 assert.equal(await checkBookable(db,t.admin.hospitalId,doc.userId,istToUtc('2026-11-18',10*60+30)),null)
})

import {staffBoard} from '../lib/services/roster'
import {patientFlow} from '../lib/services/patientflow'
import {registerPatient} from '../lib/services/patients'
test('staff board: rostered vs logged in; patient flow: waits per department and the visit journey', async()=>{
 const db=await freshDb();const t=await tenant(db,'Flow Care');const n1=await t.mk('nurse','Nurse One'),n2=await t.mk('nurse','Nurse Two'),doc=await t.mk('doctor','Dr Heart'),rec=await t.mk('reception','Desk')
 await db.query("update users set department='Cardiology' where id=$1",[doc.userId])
 const now=istToUtc('2026-11-11',11*60)
 for(const u of [n1,n2])await saveShifts(db,t.admin,u.userId,[{day:3,shift:'Morning',start:'08:00',end:'14:00'}])
 await db.query("update users set last_seen_at=$2 where id=$1",[n1.userId,new Date(now.getTime()-5*60000)])
 await db.query("update users set last_seen_at=$2 where id=$1",[rec.userId,new Date(now.getTime()-60000)])
 await assert.rejects(staffBoard(db,n1,now),(e:any)=>e.status===403)
 const b:any=await staffBoard(db,t.admin,now);const nurse=b.roles.find((r:any)=>r.role==='nurse')
 assert.deepEqual([nurse.staff,nurse.rosteredToday,nurse.onDuty,nurse.loggedInToday,nurse.activeNow],[2,2,2,1,1])
 assert.deepEqual(b.onDutyNotLoggedIn.map((x:any)=>x.full_name),['Nurse Two'])
 assert.deepEqual(b.workingOffRoster.map((x:any)=>x.full_name),['Desk'])
 // two visits to Cardiology: 20 and 40 minutes wait, 10 minutes with the doctor; one prescription dispensed 15 min later
 const m=(min:number)=>new Date(now.getTime()+min*60000)
 for(const [i,w] of [[1,20],[2,40]]){const p=await registerPatient(db,rec,{fullName:'Flow '+i,mobile:'98765000'+(10+i),gender:'Male'});await db.query("update patients set created_at=$2 where id=$1",[p.id,m(-65)])
  const q=(await db.query("insert into doctor_queue(hospital_id,patient_id,doctor_user_id,status,checked_in_at,called_at,completed_at,visit_date) values($1,$2,$3,'checked',$4,$5,$6,'2026-11-11') returning id",[t.admin.hospitalId,p.id,doc.userId,m(-60),m(-60+w),m(-50+w)])).rows[0]
  if(i===1){const e=(await db.query("insert into encounters(hospital_id,patient_id,doctor_user_id,queue_id) values($1,$2,$3,$4) returning id",[t.admin.hospitalId,p.id,doc.userId,q.id])).rows[0];await db.query("insert into prescriptions(hospital_id,patient_id,doctor_user_id,encounter_id,status,created_at,dispensed_at) values($1,$2,$3,$4,'dispensed',$5,$6)",[t.admin.hospitalId,p.id,doc.userId,e.id,m(-30),m(-15)])}}
 const f:any=await patientFlow(db,t.admin,{from:'2026-11-11',to:'2026-11-11',now})
 const c=f.departments.find((d:any)=>d.dept==='Cardiology');assert.equal(c.visits,2);assert.equal(c.doctors,1);assert.equal(c.perDoctorDay,2);assert.equal(c.share,100);assert.equal(c.newPatients,2);assert.equal(c.prev,0)
 assert.equal(f.totals.opd.value,2);assert.equal(f.totals.newPatients.value,2);assert.equal(f.totals.prescriptions.value,1)
 const ph=f.services.find((s:any)=>s.key==='pharmacy');assert.equal(ph.volume,1);assert.equal(ph.fillRate,100)
 const desk=f.services.find((s:any)=>s.key==='desk');assert.equal(desk.staff,1);assert.equal(desk.volume,4)
 assert.equal(f.hourly.reduce((a:number,b:number)=>a+b,0),2);assert.equal(f.previous.from,'2026-11-10')
 // a busy department over a week: 300 visits for one doctor -> "add a doctor"
 const p0=await registerPatient(db,rec,{fullName:'Busy One',mobile:'9876500099',gender:'Female'})
 await db.query("insert into doctor_queue(hospital_id,patient_id,doctor_user_id,status,checked_in_at,visit_date) select $1,$2,$3,'checked',$4::timestamptz+(g||' minutes')::interval,'2026-11-05' from generate_series(1,300) g",[t.admin.hospitalId,p0.id,doc.userId,istToUtc('2026-11-05',9*60)])
 const w:any=await patientFlow(db,t.admin,{from:'2026-11-05',to:'2026-11-11',now})
 assert.ok(w.actions.some((a:any)=>a.level==='add'&&/Add a doctor in Cardiology/.test(a.text)),JSON.stringify(w.actions))
 assert.ok(w.actions.some((a:any)=>a.level==='info'&&/Busiest hour/.test(a.text)))
 await assert.rejects(patientFlow(db,t.admin,{from:'2026-11-12',to:'2026-11-11'}),(e:any)=>e.status===400)
})
