import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {requireModule,memoSubscription,getSubscription} from '../lib/services/tenancy'
test('perf: requireModule reuses the per-request subscription (no extra round trip); hot-path indexes exist',async()=>{const db=await freshDb();const {admin}=await tenant(db,'Perf Hosp')
 let n=0;const counted={query:(t:string,p?:any[])=>{if(/from subscriptions/.test(t))n++;return db.query(t,p)}} as any
 const ctx={...admin};memoSubscription(ctx,await getSubscription(counted,ctx.hospitalId));assert.equal(n,1)
 await requireModule(counted,ctx,'opd');await requireModule(counted,ctx,'queue');assert.equal(n,1)
 await requireModule(counted,{...admin},'opd');assert.equal(n,2) // other request objects still look it up
 const idx=(await db.query("select indexname from pg_indexes where indexname in ('idx_queue_hosp_day','idx_queue_patient_day','idx_patients_hosp_created','idx_payments_hosp_received')")).rows.map((r:any)=>r.indexname).sort()
 assert.deepEqual(idx,['idx_patients_hosp_created','idx_payments_hosp_received','idx_queue_hosp_day','idx_queue_patient_day'])
 await assert.rejects(requireModule(db,(()=>{const c={...admin};memoSubscription(c,{usable:true,modules:['opd'],plan_name:'X'});return c})(),'insurance'),(e:any)=>e.status===402)})
