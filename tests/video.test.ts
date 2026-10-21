import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {setupVideo} from '../lib/services/video'
import {registerPatient} from '../lib/services/patients'
test('video consult: dry-run without Google, isolated by hospital',async()=>{const db=await freshDb();const t=await tenant(db,'Video Care');const d=await t.mk('doctor','Dr V');const p:any=await registerPatient(db,t.admin,{fullName:'Vid Patient',mobile:'9833300001',gender:'Male'})
 const a=(await db.query("insert into appointments(hospital_id,patient_id,doctor_user_id,scheduled_at,mode) values($1,$2,$3,now()+interval '1 day','video') returning id",[t.admin.hospitalId,p.id,d.userId])).rows[0].id
 const r=await setupVideo(db,t.admin.hospitalId,a);assert.equal(r.dryRun,true);assert.equal(r.meetUrl,null)
 const o=await tenant(db,'Video Other');await assert.rejects(setupVideo(db,o.admin.hospitalId,a),/not found/)})
