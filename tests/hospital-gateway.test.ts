import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GATEWAY_ROLES} from '../lib/services/hospitalGateway'
import {mask,encrypt,decrypt} from '../lib/services/integrations'

test('account role maps to billing — only admin+billing may manage hospital gateway',()=>{
 assert.deepEqual(GATEWAY_ROLES,['admin','billing'])
 assert.ok(!GATEWAY_ROLES.includes('doctor' as any))
 assert.ok(!GATEWAY_ROLES.includes('reception' as any))
 assert.ok(!GATEWAY_ROLES.includes('nurse' as any))
 assert.ok(!GATEWAY_ROLES.includes('lab' as any))
 assert.ok(!GATEWAY_ROLES.includes('pharmacy' as any))
})

test('hospital gateway secrets encrypt/mask like WhatsApp',()=>{
 if(!process.env.INTEGRATIONS_ENC_KEY&&!process.env.SESSION_SECRET){
  process.env.SESSION_SECRET='test-session-secret-for-gateway-unit'
 }
 const blob=encrypt({keyId:'rzp_test_hosp',keySecret:'hosp_sec',webhookSecret:'hosp_wh'})
 const out=decrypt(blob)
 assert.equal(out.keySecret,'hosp_sec')
 assert.equal(mask('rzp_test_ABCDEFGH'),'••••EFGH')
 assert.ok(!blob.includes('hosp_sec'))
})

test('platform and hospital gateway are separate modules',async()=>{
 const pg=await import('../lib/services/platformGateway')
 const hg=await import('../lib/services/hospitalGateway')
 assert.equal(typeof pg.getRazorpayCreds,'function')
 assert.equal(typeof hg.getHospitalGatewayCreds,'function')
 assert.notEqual(pg.getRazorpayCreds,hg.getHospitalGatewayCreds)
})
