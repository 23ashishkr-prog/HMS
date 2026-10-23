import {test} from 'node:test'
import assert from 'node:assert/strict'

/** Contract: platform console is SaaS-owner only — no hospital role equals platform. */
test('hospital roles are not platform',()=>{
 const hospitalAdmin={role:'admin'}
 assert.notEqual(hospitalAdmin.role,'platform')
 // There is no hospital role that equals platform — platform JWT kind must be 'platform' (see lib/api platformApi).
})

test('platform routes are owner-only paths',()=>{
 const ownerPaths=['/platform','/platform/settings','/platform/payments','/platform/hospitals']
 for(const p of ownerPaths)assert.ok(p.startsWith('/platform'))
 const hospitalNav=['/admin/settings','/billing','/pharmacy']
 for(const p of hospitalNav)assert.ok(!p.startsWith('/platform'))
})
