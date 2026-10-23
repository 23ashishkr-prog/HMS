import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {onboardHospital,getSubscription,requireModule} from '../lib/services/tenancy'
import {PLAN_PRICE_INR,TRIAL_DAYS,TRIAL_PLAN,canonicalPlan} from '../lib/plans'
const DAY=86400000
test('catalogue prices match Market PMS finals',()=>{
 assert.equal(PLAN_PRICE_INR.clinic,1999)
 assert.equal(PLAN_PRICE_INR.basic,19999)
 assert.equal(PLAN_PRICE_INR.ai_engage,49999)
 assert.equal(TRIAL_PLAN,'basic')
 assert.equal(TRIAL_DAYS(),30)
 assert.equal(canonicalPlan('pro'),'ai_engage')
 assert.equal(canonicalPlan('enterprise'),'ai_engage')
 assert.equal(canonicalPlan('clinic'),'clinic')
})
test('free signup always gets Basic + ~30-day trial even if AI plan requested', async()=>{
 const db=await freshDb()
 const h=await onboardHospital(db,{hospitalName:'Force Basic',adminName:'A',adminEmail:'a@forcebasic.in',password:'S3cure-pass!',planCode:'ai_engage'})
 assert.equal(h.plan,'basic')
 const s=await getSubscription(db,h.hospitalId)
 assert.equal(s.plan_code,'basic')
 assert.ok(s.modules.includes('billing')&&s.modules.includes('lab')&&!s.modules.includes('ai')&&!s.modules.includes('engagement'))
 const days=Math.round((new Date(s.trial_ends_at).getTime()-Date.now())/DAY)
 assert.ok(days>=28&&days<=32,'got '+days)
})
test('Clinic plan modules: booking only; paid upgrade unlocks', async()=>{
 const db=await freshDb();const {admin}=await tenant(db,'Clinic Co','clinic')
 const s=await getSubscription(db,admin.hospitalId)
 assert.equal(s.plan_code,'clinic')
 assert.ok(s.modules.includes('queue')&&s.modules.includes('appointments')&&!s.modules.includes('billing')&&!s.modules.includes('ai'))
 await assert.rejects(()=>requireModule(db,admin,'billing'),(e:any)=>e.status===402)
 await assert.rejects(()=>requireModule(db,admin,'ai'),(e:any)=>e.status===402)
 await requireModule(db,admin,'queue')
})
test('ai_engage unlocks ai + engagement', async()=>{
 const db=await freshDb();const {admin}=await tenant(db,'AI Hosp','ai_engage')
 await requireModule(db,admin,'ai');await requireModule(db,admin,'engagement');await requireModule(db,admin,'bulk')
})
