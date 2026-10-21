import {test} from 'node:test';import assert from 'node:assert/strict'
import {requireRole} from '../lib/services/core'
test('hospital admin is a superuser for every staff role, never for patient-only actions',()=>{const a:any={role:'admin',hospitalId:'h',userId:'u'};for(const r of ['doctor','lab','pharmacy','billing','reception','nurse'])assert.doesNotThrow(()=>requireRole(a,[r as any]));assert.throws(()=>requireRole(a,['patient' as any]));assert.throws(()=>requireRole({role:'lab',hospitalId:'h',userId:'u'} as any,['pharmacy']))})
