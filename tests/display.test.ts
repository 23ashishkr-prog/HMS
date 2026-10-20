import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {checkIn,startEncounter} from '../lib/services/opd'
import {displayBoard,displayLink} from '../lib/services/display'
test('TV display: keyed, no patient names, now/next per doctor; near-turn notification once, consent-gated',async()=>{const db=await freshDb();const {h,mk}=await tenant(db,'TV Hosp');const rec=await mk('reception','R TV'),doc=await mk('doctor','Dr Screen')
 await db.query('update hospitals set notify_whatsapp=true where id=$1',[h.hospitalId])
 const ps=[];for(let i=0;i<4;i++)ps.push(await registerPatient(db,rec,{fullName:'Secret Person'+'abcd'[i],mobile:'98765009'+(10+i),consentWhatsapp:i!==3}))
 const q=[];for(const p of ps)q.push(await checkIn(db,rec,{patientId:p.id,doctorId:doc.userId}))
 const code=(await db.query('select code from hospitals where id=$1',[h.hospitalId])).rows[0].code;const l=await displayLink(db,h.hospitalId);const key=new URLSearchParams(l.path.split('?')[1]).get('k')!
 await assert.rejects(displayBoard(db,code,'nope'),(e:any)=>e.status===404)
 let b=await displayBoard(db,code,key);assert.equal(b.doctors[0].now,null);assert.deepEqual(b.doctors[0].next,[1,2,3]);assert.doesNotMatch(JSON.stringify(b),/Secret/)
 await startEncounter(db,doc,{queueId:q[0].id});b=await displayBoard(db,code,key);assert.equal(b.doctors[0].now,1);assert.deepEqual(b.doctors[0].next,[2,3,4])
 // 2 ahead → token 3 gets the near-turn message
 let o=(await db.query("select patient_id from notification_outbox where kind='near_turn'")).rows;assert.equal(o.length,1);assert.equal(o[0].patient_id,ps[2].id)
 await startEncounter(db,doc,{queueId:q[0].id}) // re-open same token: no duplicate
 await startEncounter(db,doc,{queueId:q[1].id}) // token 4 has 2 ahead but no consent
 o=(await db.query("select patient_id from notification_outbox where kind='near_turn'")).rows;assert.equal(o.length,1)
 const r=await displayLink(db,h.hospitalId,true);assert.notEqual(r.path,l.path);await assert.rejects(displayBoard(db,code,key),(e:any)=>e.status===404)})
