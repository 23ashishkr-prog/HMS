import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {saveWeek,addLeave,slotGrid,checkBookable,doctorStatuses,setOnline,istToUtc} from '../lib/services/doctorsched'
import {freeSlots} from '../lib/services/patientcomms'
test('weekly sessions, leave and online status drive bookable slots',async()=>{const db:any=await freshDb();const t=await tenant(db,'Sch '+Math.random(),'enterprise');const doc=await t.mk('doctor','Dr Sched');const other=await tenant(db,'Sch2 '+Math.random(),'enterprise')
 // 2026-10-26 is a Monday
 await saveWeek(db,t.admin,doc.userId,[{day:1,start:'09:00',end:'10:00',slotMinutes:20},{day:1,start:'17:00',end:'18:00',slotMinutes:30}])
 const g=await slotGrid(db,t.admin.hospitalId,doc.userId,'2026-10-26');assert.equal(g.length,5);assert.equal(g[0].toISOString(),istToUtc('2026-10-26',540).toISOString());assert.equal(g[3].toISOString(),istToUtc('2026-10-26',1020).toISOString())
 assert.equal((await slotGrid(db,t.admin.hospitalId,doc.userId,'2026-10-27')).length,0)
 assert.equal(await checkBookable(db,t.admin.hospitalId,doc.userId,istToUtc('2026-10-26',540)),null)
 assert.match(String(await checkBookable(db,t.admin.hospitalId,doc.userId,istToUtc('2026-10-26',720))),/outside/)
 await assert.rejects(saveWeek(db,t.admin,doc.userId,[{day:1,start:'09:00',end:'11:00',slotMinutes:15},{day:1,start:'10:00',end:'12:00',slotMinutes:15}]),/overlap/)
 await assert.rejects(saveWeek(db,other.admin,doc.userId,[]),/not found/i)
 await addLeave(db,t.admin,doc.userId,{startDate:'2026-10-26',reason:'Conference'})
 assert.equal((await slotGrid(db,t.admin.hospitalId,doc.userId,'2026-10-26')).length,0)
 assert.match(String(await checkBookable(db,t.admin.hospitalId,doc.userId,istToUtc('2026-10-26',540))),/leave/)
 assert.equal((await freeSlots(db,t.admin.hospitalId,doc.userId,'2026-10-26',{start:'09:00',end:'17:00',slotMin:15},null,new Date('2026-10-20T00:00:00Z'),10)).length,0)
 const st=await doctorStatuses(db,t.admin.hospitalId,istToUtc('2026-10-26',560));assert.equal(st.find(x=>x.id===doc.userId)!.status,'on_leave')
 const st2=await doctorStatuses(db,t.admin.hospitalId,istToUtc('2026-11-02',560));assert.equal(st2.find(x=>x.id===doc.userId)!.status,'available')
 await setOnline(db,doc,undefined,false);const st3=await doctorStatuses(db,t.admin.hospitalId,istToUtc('2026-11-02',560));assert.equal(st3.find(x=>x.id===doc.userId)!.status,'offline')
 // no sessions configured -> hospital hours fallback
 const d2=await t.mk('doctor','Dr Default');assert.ok((await slotGrid(db,t.admin.hospitalId,d2.userId,'2026-10-27')).length>0)})
