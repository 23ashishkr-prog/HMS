import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addBed,admit} from '../lib/services/ipd'
import {addMedOrder,stopMedOrder,mar,recordDose,addChart,addNote,wardChart,wardDue} from '../lib/services/nursing'
import {istToUtc} from '../lib/services/doctorsched'

test('eMAR: scheduled doses, charting, overdue, stop; vitals, intake/output balance; notes and rounds', async()=>{
 const db=await freshDb();const t=await tenant(db,'Ward Nursing');const rec=await t.mk('reception','Desk'),doc=await t.mk('doctor','Dr Round'),nurse=await t.mk('nurse','Sister Ann')
 const bed=await addBed(db,t.admin,{ward:'Male',bedNo:'M1'});const p=await registerPatient(db,rec,{fullName:'Ward Patient',mobile:'9876507777'})
 const a=await admit(db,rec,{patientId:p.id,doctorId:doc.userId,bedId:bed.id})
 await assert.rejects(addMedOrder(db,nurse,a.id,{medicine:'X'}),(e:any)=>e.status===403,'nurses do not order')
 const day='2026-11-10'
 const o=await addMedOrder(db,doc,a.id,{medicine:'Inj Ceftriaxone 1 g',dose:'1 g',route:'IV',frequency:'BD',startsOn:day,days:5})
 assert.deepEqual(o.times,['09:00','21:00']);assert.equal(o.ends_on instanceof Date?o.ends_on.toISOString().slice(0,10):String(o.ends_on).slice(0,10),'2026-11-14')
 const sos=await addMedOrder(db,doc,a.id,{medicine:'Tab Paracetamol 650',frequency:'SOS',startsOn:day})
 // 11:00 IST: 09:00 dose is overdue (>1h late), 21:00 is later
 let m=await mar(db,nurse,a.id,day,istToUtc(day,11*60));let row:any=m.orders.find((x:any)=>x.id===o.id)
 assert.deepEqual(row.doses.map((d:any)=>[d.time,d.status]),[['09:00','overdue'],['21:00','upcoming']]);assert.equal(m.overdue,1)
 await assert.rejects(recordDose(db,nurse,o.id,{at:istToUtc(day,10*60).toISOString(),status:'given'}),(e:any)=>e.status===400,'time not on the order')
 await assert.rejects(recordDose(db,nurse,o.id,{at:istToUtc(day,9*60).toISOString(),status:'held'}),(e:any)=>e.status===400,'held needs a reason')
 await recordDose(db,nurse,o.id,{at:istToUtc(day,9*60).toISOString(),status:'given'})
 m=await mar(db,nurse,a.id,day,istToUtc(day,11*60));row=m.orders.find((x:any)=>x.id===o.id);assert.equal(row.doses[0].status,'given');assert.equal(row.doses[0].by,'Sister Ann');assert.equal(m.overdue,0)
 await recordDose(db,nurse,sos.id,{status:'given',note:'fever 101'});const sosRow:any=(await mar(db,nurse,a.id)).orders.find((x:any)=>x.id===sos.id);assert.equal(sosRow.doses.length,1);assert.equal(sosRow.doses[0].asNeeded,true)
 await stopMedOrder(db,doc,o.id,{reason:'switched to oral'});await assert.rejects(recordDose(db,nurse,o.id,{status:'given'}),(e:any)=>e.status===409)
 // charts
 await assert.rejects(addChart(db,nurse,a.id,{kind:'vitals',spo2:140}),(e:any)=>e.status===400)
 await addChart(db,nurse,a.id,{kind:'vitals',bpSys:120,bpDia:80,pulse:88,tempF:99.4,spo2:97})
 await addChart(db,nurse,a.id,{kind:'intake',volumeMl:500,type:'IV fluid',item:'NS'});await addChart(db,nurse,a.id,{kind:'intake',volumeMl:300});await addChart(db,nurse,a.id,{kind:'output',volumeMl:450,type:'urine'})
 await assert.rejects(addNote(db,nurse,a.id,{kind:'round',text:'x'}),(e:any)=>e.status===403,'rounds are for doctors')
 await addNote(db,nurse,a.id,{text:'Comfortable, IV line patent'});await addNote(db,doc,a.id,{kind:'round',text:'Afebrile, platelets rising',plan:'Switch to oral, discharge in 2 days'})
 const w=await wardChart(db,nurse,a.id);assert.deepEqual(w.balance24h,{intake:800,output:450,net:350});assert.equal(w.vitals[0].data.spo2,97);assert.equal(w.notes.length,2);assert.equal(w.notes.find((n:any)=>n.kind==='round').plan,'Switch to oral, discharge in 2 days')
 assert.equal(typeof (await wardDue(db,nurse)),'object')
})
