import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {frontDeskVisit} from '../lib/services/flows';import {startEncounter,listQueue,recordVitals} from '../lib/services/opd'
test('nurse can open a waiting token for vitals without calling the patient in',async()=>{const db=await freshDb();const t=await tenant(db,'Triage');const rec=await t.mk('reception','Desk'),doc=await t.mk('doctor','Dr T'),nurse=await t.mk('nurse','Sister')
 await frontDeskVisit(db,rec,{patient:{fullName:'Vitals Person',mobile:'9876500091',gender:'Male'},doctorId:doc.userId})
 const q=(await listQueue(db,doc))[0];const e=await startEncounter(db,nurse,{queueId:q.id});assert.equal(e.doctor_user_id,doc.userId)
 await recordVitals(db,nurse,{encounterId:e.id,temperatureC:38.4,pulse:92})
 assert.equal((await listQueue(db,doc))[0].status,'waiting')
 const e2=await startEncounter(db,doc,{queueId:q.id});assert.equal(e2.id,e.id);assert.equal((await listQueue(db,doc))[0].status,'consultation')
 await assert.rejects(()=>startEncounter(db,nurse,{patientId:q.patient_id}),/queue token/)})
