import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {setupStatus,applyDefaults,DEFAULT_SERVICES} from '../lib/services/setup'
test('setup wizard: checklist from live data, defaults are idempotent and admin-only',async()=>{const db=await freshDb();const t=await tenant(db,'Setup Care');const doc=await t.mk('doctor','Dr S');const rec=await t.mk('reception','R S')
 let s=await setupStatus(db,t.admin);assert.ok(s.progress<100);await assert.rejects(setupStatus(db,rec),/role/)
 const a=await applyDefaults(db,t.admin,'all');assert.ok(a.added>=DEFAULT_SERVICES.length);const b=await applyDefaults(db,t.admin,'all');assert.equal(b.added,0,'second run adds nothing')
 assert.equal((await db.query('select count(*)::int n from doctor_availability where doctor_user_id=$1',[doc.userId])).rows[0].n,12)
 s=await setupStatus(db,t.admin);for(const id of ['services','departments','schedules','beds'])assert.equal(s.steps.find((x:any)=>x.id===id)!.done,true,id)
 const o=await tenant(db,'Setup Other');assert.equal((await db.query('select count(*)::int n from beds where hospital_id=$1',[o.admin.hospitalId])).rows[0].n,0)})
