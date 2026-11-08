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
