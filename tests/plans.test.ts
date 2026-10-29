import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {onboardHospital,getSubscription,requireModule} from '../lib/services/tenancy'
import {PLAN_PRICE_INR,TRIAL_DAYS,TRIAL_PLAN,canonicalPlan,showTrialCountdown} from '../lib/plans'
const DAY=86400000
test('trial countdown is hidden once a plan is active',()=>{
 assert.equal(showTrialCountdown('active',12),false)
 assert.equal(showTrialCountdown('active',null),false)
 assert.equal(showTrialCountdown('trialing',20),true)
 assert.equal(showTrialCountdown('trialing',20,{banner:true}),false)
 assert.equal(showTrialCountdown('trialing',3,{banner:true}),true)
 assert.equal(showTrialCountdown('on_hold',1),false)
})
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
test('self-serve trial follows clinic or basic and rejects AI contact-sales', async()=>{
 const db=await freshDb()
 const clinic=await onboardHospital(db,{hospitalName:'Clinic Trial',adminName:'A',adminEmail:'a@clinictrial.in',password:'S3cure-pass!',planCode:'clinic'})
 assert.equal(clinic.plan,'clinic')
 const cs=await getSubscription(db,clinic.hospitalId)
 assert.equal(cs.plan_code,'clinic')
 assert.ok(!cs.modules.includes('billing')&&!cs.modules.includes('ai'))
 const days=Math.round((new Date(cs.trial_ends_at).getTime()-Date.now())/DAY)
 assert.ok(days>=28&&days<=32,'got '+days)
 const basic=await onboardHospital(db,{hospitalName:'Basic Trial',adminName:'A',adminEmail:'a@basictrial.in',password:'S3cure-pass!',planCode:'nope'})
 assert.equal(basic.plan,'basic')
 await assert.rejects(onboardHospital(db,{hospitalName:'AI Sales',adminName:'A',adminEmail:'a@aisales.in',password:'S3cure-pass!',planCode:'ai_engage'}),(e:any)=>e.status===403&&/Contact Sales/.test(e.message))
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
