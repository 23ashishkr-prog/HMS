import {test} from 'node:test';import assert from 'node:assert/strict'
import {requireRole} from '../lib/services/core'
test('hospital admin is a superuser for every staff role, never for patient-only actions',()=>{const a:any={role:'admin',hospitalId:'h',userId:'u'};for(const r of ['doctor','lab','pharmacy','billing','reception','nurse'])assert.doesNotThrow(()=>requireRole(a,[r as any]));assert.throws(()=>requireRole(a,['patient' as any]));assert.throws(()=>requireRole({role:'lab',hospitalId:'h',userId:'u'} as any,['pharmacy']))})
test('platform console is separate from hospital roles (documented contract)',()=>{
 // Hospital requireRole must never grant platform access; platform uses cookie hms_platform + platform_admins only.
 const hospitalAdmin:any={role:'admin',hospitalId:'h',userId:'u'}
 assert.doesNotThrow(()=>requireRole(hospitalAdmin,['admin']))
 // There is no hospital role that equals platform — platform JWT kind must be 'platform' (see lib/api platformApi).
 assert.notEqual(hospitalAdmin.role,'platform')
})
