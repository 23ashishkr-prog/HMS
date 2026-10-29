import {test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb} from './helpers'
import {onboardHospital,getSubscription} from '../lib/services/tenancy'
import {platformEndTrial,platformConvertPaid,platformResetTrialBlock,runLifecycle} from '../lib/services/lifecycle'
import {trialPlanFromParam,trialDaysRemaining,dueTrialReminders,aiFeaturesFor,isContactSalesPlan} from '../lib/plans'
import {normEmail,normPhone,normHospitalName,normGstin} from '../lib/services/trialIdentity'

const GST='27AAPFU0939F1ZV'
const by={id:'00000000-0000-0000-0000-000000000001',email:'owner@hms.test'}

test('plan preselect: clinic and basic, unknown falls back to basic, ai_engage is contact sales',()=>{
 assert.equal(trialPlanFromParam('clinic'),'clinic')
 assert.equal(trialPlanFromParam('BASIC'),'basic')
 assert.equal(trialPlanFromParam(''),'basic')
 assert.equal(trialPlanFromParam('gold'),'basic')
 assert.equal(trialPlanFromParam('ai_engage'),'basic')
 assert.equal(isContactSalesPlan('ai_engage'),true)
 assert.equal(isContactSalesPlan('pro'),true)
 assert.equal(isContactSalesPlan('clinic'),false)
 const clinic=aiFeaturesFor('clinic'),basic=aiFeaturesFor('basic'),ai=aiFeaturesFor('ai_engage')
 assert.ok(clinic.every(f=>!f.included)&&basic.every(f=>!f.included))
 assert.deepEqual(ai.map(f=>f.included),[true,true])
})

test('trial expiry math: ceil days, zero at and after the end, reminders at 7, 3 and 1',()=>{
 const end=new Date('2026-11-30T00:00:00.000Z')
 assert.equal(trialDaysRemaining(end,new Date('2026-11-23T00:00:00.000Z')),7)
 assert.equal(trialDaysRemaining(end,new Date('2026-11-27T00:00:00.000Z')),3)
 assert.equal(trialDaysRemaining(end,new Date('2026-11-29T00:00:01.000Z')),1)
 assert.equal(trialDaysRemaining(end,new Date('2026-11-29T12:00:00.000Z')),1)
 assert.equal(trialDaysRemaining(end,end),0)
 assert.equal(trialDaysRemaining(end,new Date('2026-12-01T00:00:00.000Z')),0)
 assert.equal(trialDaysRemaining(null),null)
 assert.deepEqual(dueTrialReminders(8),[])
 assert.deepEqual(dueTrialReminders(7),[7])
 assert.deepEqual(dueTrialReminders(3),[7,3])
 assert.deepEqual(dueTrialReminders(1),[7,3,1])
 assert.deepEqual(dueTrialReminders(0),[])
})

test('one trial per organisation, then owner reset, end and convert are audited',async()=>{
 const db=await freshDb()
 assert.equal(normEmail('  A@B.IN '),'a@b.in')
 assert.equal(normPhone('+91 98765-43210'),'9876543210')
 assert.equal(normHospitalName('Sunrise-Hospital'),'sunrise hospital')
 assert.equal(normGstin('27aapfu0939f1zv'),GST)
 const first=await onboardHospital(db,{hospitalName:'Sunrise Hospital',adminName:'A',adminEmail:'a@sun.in',password:'S3cure-pass!',phone:'9876543210',gstin:GST,planCode:'clinic'})
 assert.equal(first.plan,'clinic')
 const s=await getSubscription(db,first.hospitalId)
 assert.equal(s.status,'trialing')
 assert.ok(s.trial_started_at)
 const again=(body:any)=>onboardHospital(db,{adminName:'B',password:'S3cure-pass!',planCode:'basic',...body})
 await assert.rejects(again({hospitalName:'Other Place',adminEmail:'a@sun.in'}),(e:any)=>e.status===409&&/admin email/.test(e.message)&&e.extra?.buyPath==='/auth/login')
 await assert.rejects(again({hospitalName:'Other Place',adminEmail:'b@sun.in',phone:'+91 98765 43210'}),(e:any)=>e.status===409&&/phone/.test(e.message))
 await assert.rejects(again({hospitalName:'sunrise   hospital',adminEmail:'c@sun.in'}),(e:any)=>e.status===409&&/hospital name/.test(e.message))
 await assert.rejects(again({hospitalName:'Third Place',adminEmail:'d@sun.in',gstin:'27aapfu0939f1zv'}),(e:any)=>e.status===409&&/GSTIN/.test(e.message))
 await assert.rejects(onboardHospital(db,{hospitalName:'AI Place',adminName:'A',adminEmail:'e@sun.in',password:'S3cure-pass!',planCode:'enterprise'}),(e:any)=>e.status===403)
 const cleared=await platformResetTrialBlock(db,first.hospitalId,by)
 assert.ok(cleared.cleared>=1)
 const second=await again({hospitalName:'Sunrise Hospital',adminEmail:'a@sun.in',phone:'9876543210',gstin:GST})
 assert.equal(second.plan,'basic')
 await platformEndTrial(db,second.hospitalId,by)
 let sub=await getSubscription(db,second.hospitalId)
 assert.equal(sub.status,'on_hold')
 assert.equal(sub.usable,false)
 await platformConvertPaid(db,second.hospitalId,by,'basic')
 sub=await getSubscription(db,second.hospitalId)
 assert.equal(sub.status,'active')
 assert.equal(sub.plan_code,'basic')
 assert.equal(sub.usable,true)
 const audit=(await db.query("select action from audit_log where hospital_id=$1 and action like 'platform_%' order by action",[second.hospitalId])).rows.map(r=>r.action)
 assert.ok(audit.includes('platform_end_trial')&&audit.includes('platform_convert_paid'))
 await db.query("update subscriptions set trial_ends_at=now()-interval '1 day', status='trialing', hold_started_at=null where hospital_id=$1",[first.hospitalId])
 await runLifecycle(db)
 assert.equal((await getSubscription(db,first.hospitalId)).status,'on_hold')
 const patients=(await db.query('select count(*)::int n from patients where hospital_id=$1',[first.hospitalId])).rows[0].n
 assert.equal(patients,0)
 assert.equal((await db.query('select purged_at from subscriptions where hospital_id=$1',[first.hospitalId])).rows[0].purged_at,null)
})
