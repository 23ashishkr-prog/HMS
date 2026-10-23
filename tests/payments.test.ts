import {test} from 'node:test';import assert from 'node:assert/strict'
import {PLAN_ANNUAL_INR,PLAN_PRICE_INR,canonicalPlan} from '../lib/plans'
import {planAmountInr,periodEndIso,paymentsReady} from '../lib/services/razorpay'
import {paymentsConfigured} from '../lib/services/tenancy'

test('plan checkout amounts match catalogue (monthly and annual)',()=>{
 assert.equal(planAmountInr('clinic','monthly'),PLAN_PRICE_INR.clinic)
 assert.equal(planAmountInr('basic','annual'),PLAN_ANNUAL_INR.basic)
 assert.equal(planAmountInr('ai_engage','monthly'),49999)
})

test('period end is about one month or one year ahead',()=>{
 const from=new Date('2026-01-15T00:00:00Z')
 const m=new Date(periodEndIso('monthly',from))
 const a=new Date(periodEndIso('annual',from))
 assert.equal(m.getUTCMonth(),1)
 assert.equal(a.getUTCFullYear(),2027)
})

test('paymentsConfigured is false unless all three Razorpay env vars are set (never fake success)',()=>{
 const bak={id:process.env.RAZORPAY_KEY_ID,sec:process.env.RAZORPAY_KEY_SECRET,wh:process.env.RAZORPAY_WEBHOOK_SECRET}
 delete process.env.RAZORPAY_KEY_ID
 delete process.env.RAZORPAY_KEY_SECRET
 delete process.env.RAZORPAY_WEBHOOK_SECRET
 assert.equal(paymentsConfigured(),false)
 assert.equal(paymentsReady(),false)
 process.env.RAZORPAY_KEY_ID='rzp_test_x'
 assert.equal(paymentsConfigured(),false)
 process.env.RAZORPAY_KEY_SECRET='sec'
 process.env.RAZORPAY_WEBHOOK_SECRET='whsec'
 assert.equal(paymentsConfigured(),true)
 assert.equal(paymentsReady(),true)
 if(bak.id)process.env.RAZORPAY_KEY_ID=bak.id; else delete process.env.RAZORPAY_KEY_ID
 if(bak.sec)process.env.RAZORPAY_KEY_SECRET=bak.sec; else delete process.env.RAZORPAY_KEY_SECRET
 if(bak.wh)process.env.RAZORPAY_WEBHOOK_SECRET=bak.wh; else delete process.env.RAZORPAY_WEBHOOK_SECRET
})

test('canonical plan maps legacy codes for checkout',()=>{
 assert.equal(canonicalPlan('pro'),'ai_engage')
 assert.equal(canonicalPlan('enterprise'),'ai_engage')
})
