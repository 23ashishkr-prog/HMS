import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encrypt,decrypt,mask} from '../lib/services/integrations'
import {envPaymentsConfigured} from '../lib/services/platformGateway'
import {paymentsConfigured} from '../lib/services/tenancy'
import {paymentsReady} from '../lib/services/razorpay'

test('mask shows last 4 only',()=>{
 assert.equal(mask(''),'')
 assert.equal(mask('short'),'••••')
 assert.equal(mask('rzp_test_ABCDEFGH'),'••••EFGH')
})

test('encrypt/decrypt round-trip for gateway secrets (INTEGRATIONS_ENC_KEY or SESSION_SECRET)',()=>{
 if(!process.env.INTEGRATIONS_ENC_KEY&&!process.env.SESSION_SECRET){
  process.env.SESSION_SECRET='test-session-secret-for-gateway-unit'
 }
 const blob=encrypt({keyId:'rzp_test_abc',keySecret:'sec_xyz',webhookSecret:'wh_123'})
 const out=decrypt(blob)
 assert.equal(out.keyId,'rzp_test_abc')
 assert.equal(out.keySecret,'sec_xyz')
 assert.equal(out.webhookSecret,'wh_123')
 assert.ok(!blob.includes('sec_xyz'))
})

test('env paymentsConfigured false unless all three set',()=>{
 const bak={id:process.env.RAZORPAY_KEY_ID,sec:process.env.RAZORPAY_KEY_SECRET,wh:process.env.RAZORPAY_WEBHOOK_SECRET}
 delete process.env.RAZORPAY_KEY_ID
 delete process.env.RAZORPAY_KEY_SECRET
 delete process.env.RAZORPAY_WEBHOOK_SECRET
 assert.equal(envPaymentsConfigured(),false)
 assert.equal(paymentsConfigured(),false)
 assert.equal(paymentsReady(),false)
 process.env.RAZORPAY_KEY_ID='rzp_test_x'
 process.env.RAZORPAY_KEY_SECRET='sec'
 process.env.RAZORPAY_WEBHOOK_SECRET='whsec'
 assert.equal(envPaymentsConfigured(),true)
 assert.equal(paymentsConfigured(),true)
 if(bak.id)process.env.RAZORPAY_KEY_ID=bak.id; else delete process.env.RAZORPAY_KEY_ID
 if(bak.sec)process.env.RAZORPAY_KEY_SECRET=bak.sec; else delete process.env.RAZORPAY_KEY_SECRET
 if(bak.wh)process.env.RAZORPAY_WEBHOOK_SECRET=bak.wh; else delete process.env.RAZORPAY_WEBHOOK_SECRET
})
