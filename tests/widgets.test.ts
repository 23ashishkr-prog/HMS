import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {getLayout,saveLayout,saveHospitalDefault,widgetData,roleDefault} from '../lib/services/widgets'
test('home widgets: role-filtered library, per-user layout, hospital default per role, reset, isolation',async()=>{const db=await freshDb();const t=await tenant(db,'Widget Care');const lab=await t.mk('lab','Lab One');const doc=await t.mk('doctor','Dr W')
 let l=await getLayout(db,lab);assert.equal(l.source,'role');assert.ok(!l.catalog.some((w:any)=>w.id==='collections'),'lab cannot add collections')
 const s=await saveLayout(db,lab,{layout:[{id:'pending_labs',size:'l'},{id:'collections',size:'s'},{id:'pending_labs',size:'s'},{id:'quick_actions',size:'zz'}]});assert.deepEqual(s.layout,[{id:'pending_labs',size:'l'},{id:'quick_actions',size:'m'}]);assert.equal(s.source,'user')
 await assert.rejects(saveHospitalDefault(db,lab,{role:'lab',layout:[]}),/role/)
 await saveHospitalDefault(db,t.admin,{role:'doctor',layout:[{id:'appointments',size:'l'},{id:'opd_queue',size:'m'}]});l=await getLayout(db,doc);assert.equal(l.source,'hospital');assert.equal(l.layout[0].id,'appointments')
 await saveLayout(db,doc,{layout:[{id:'reminders',size:'s'}]});assert.equal((await getLayout(db,doc)).layout[0].id,'reminders');assert.equal((await saveLayout(db,doc,{reset:true})).source,'hospital')
 await saveHospitalDefault(db,t.admin,{role:'doctor',reset:true});assert.deepEqual((await getLayout(db,doc)).layout,roleDefault('doctor'))
 const d=await widgetData(db,lab,['pending_labs','collections','beds']);assert.ok(d.pending_labs);assert.equal(d.collections,undefined,'not allowed for lab')
 const a=await widgetData(db,t.admin,['collections','beds','low_stock','doctor_availability','opd_queue','appointments','reminders','kpi_patients','unpaid','expiring']);assert.equal(a.collections.total,0);assert.ok(Array.isArray(a.doctor_availability))
 const o=await tenant(db,'Other Widget');assert.equal((await getLayout(db,o.admin)).source,'role')})
