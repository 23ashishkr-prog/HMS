import {test} from 'node:test';import assert from 'node:assert/strict'
import {navFor,NAV} from '../lib/nav'

test('admin side menu leaves out what Settings opens; reception keeps its check-in code', ()=>{
 const admin=navFor('admin').open.map(n=>n.path)
 for(const p of ['/checkin-qr','/admin/closeout','/admin/import','/admin/audit'])assert.ok(!admin.includes(p),p+' should only be under Settings')
 assert.ok(admin.includes('/admin/settings'))
 assert.ok(navFor('reception').open.some(n=>n.path==='/checkin-qr'),'reception has no Settings, so it keeps Check-in code')
 assert.ok(!navFor('admin',['queue']).locked.some(n=>n.inSettings),'no upgrade prompts for Settings items either')
 assert.deepEqual(NAV.filter(n=>n.inSettings).map(n=>n.name).sort(),['Activity','Check-in code','End of day','Import records'])
})
