import {test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {NAV,navFor,canSee} from '../lib/nav'
import {accessMatrix,setAccess,resetAccess,accessFor,requirePath} from '../lib/services/roleaccess'
import {recordHit,listFavourites} from '../lib/services/favourites'

test('canSee falls back to NAV defaults and keeps Home and admin fixed',()=>{
 assert.equal(canSee('lab','/pharmacy'),false)
 assert.equal(canSee('lab','/pharmacy',{'/pharmacy':true}),true)
 assert.equal(canSee('pharmacy','/pharmacy',{'/pharmacy':false}),false)
 assert.equal(canSee('nurse','/dashboard',{'/dashboard':false}),true,'Home stays on')
 assert.equal(canSee('admin','/admin/settings',{'/admin/settings':false}),true,'admin never loses Settings')
 assert.ok(!navFor('pharmacy',null,{'/pharmacy':false}).open.some(n=>n.path==='/pharmacy'))
 assert.ok(navFor('lab',null,{'/pharmacy':true}).open.some(n=>n.path==='/pharmacy'))
})

test('matrix lists every NAV item for every staff role, admin only', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Role Hosp')
 const m=await accessMatrix(db,admin)
 assert.equal(m.items.length,NAV.length)
 assert.deepEqual(m.roles.map(r=>r.role),['doctor','nurse','reception','lab','pharmacy','billing'])
 const ph=m.items.find(i=>i.path==='/pharmacy')!
 assert.deepEqual(ph.cells.pharmacy,{default:true,allowed:true,overridden:false})
 assert.equal(ph.cells.lab.allowed,false)
 assert.equal(m.items.find(i=>i.path==='/dashboard')!.locked,true)
 assert.equal(m.items.find(i=>i.path==='/admin/settings')!.group,'settings')
 assert.equal(m.items.find(i=>i.path==='/frontdesk')!.group,'daily')
 const nurse=await mk('nurse','Nina Nurse')
 await assert.rejects(accessMatrix(db,nurse),/Only the hospital admin/)
 await assert.rejects(setAccess(db,nurse,{role:'nurse',path:'/pharmacy',allowed:true}),/Only the hospital admin/)
})

test('admin turns items off and on; overrides are per hospital and audited', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Toggle Hosp');const other=await tenant(db,'Other Toggle')
 const ph=await mk('pharmacy','Paul Pharma');const lab=await mk('lab','Lata Lab')
 let m=await setAccess(db,admin,{role:'pharmacy',path:'/pharmacy',allowed:false})
 assert.deepEqual(m.items.find(i=>i.path==='/pharmacy')!.cells.pharmacy,{default:true,allowed:false,overridden:true})
 assert.equal(m.roles.find(r=>r.role==='pharmacy')!.overrides,1)
 assert.deepEqual(await accessFor(db,ph),{'/pharmacy':false})
 await assert.rejects(requirePath(db,ph,'/pharmacy'),(e:any)=>e.status===403&&/turned off for the Pharmacy role/.test(e.message))
 await requirePath(db,admin,'/pharmacy')
 await requirePath(db,ph,'/dashboard')
 m=await setAccess(db,admin,{role:'lab',path:'/pharmacy',allowed:true})
 assert.match(String(m.warning),/Lab now sees Pharmacy/)
 await requirePath(db,lab,'/pharmacy')
 assert.deepEqual(await accessFor(db,await other.mk('lab','Olly Lab')),{},'other hospital unaffected')
 // Setting a cell back to its default removes the override.
 m=await setAccess(db,admin,{role:'pharmacy',path:'/pharmacy',allowed:true})
 assert.equal(m.items.find(i=>i.path==='/pharmacy')!.cells.pharmacy.overridden,false)
 assert.equal((await db.query("select count(*)::int n from role_access where hospital_id=$1 and role='pharmacy'",[admin.hospitalId])).rows[0].n,0)
 const a=(await db.query("select action,details from audit_log where hospital_id=$1 and action like 'role_access%' order by created_at",[admin.hospitalId])).rows
 assert.equal(a.length,3);assert.equal(a[0].details.path,'/pharmacy')
})

test('guards: admin, Home and admin-only pages', async()=>{
 const db=await freshDb();const {admin}=await tenant(db,'Guard Hosp')
 await assert.rejects(setAccess(db,admin,{role:'admin',path:'/admin/settings',allowed:false}),/Admin always sees every page/)
 await assert.rejects(setAccess(db,admin,{role:'nurse',path:'/dashboard',allowed:false}),/Home stays on/)
 await assert.rejects(setAccess(db,admin,{role:'nurse',path:'/nope',allowed:false}),/Unknown menu item/)
 await assert.rejects(setAccess(db,admin,{role:'patient',path:'/opd',allowed:true}),/staff role/)
 await assert.rejects(setAccess(db,admin,{role:'nurse',path:'/opd',allowed:'yes'}),/true or false/)
 await assert.rejects(setAccess(db,admin,{role:'reception',path:'/admin/audit',allowed:true}),(e:any)=>e.status===400&&e.extra?.narrowOnly)
 const m=await setAccess(db,admin,{role:'billing',path:'/admin/settings',allowed:false})
 assert.equal(m.items.find(i=>i.path==='/admin/settings')!.cells.billing.allowed,false,'narrow-only pages can still be turned off')
})

test('reset per role and overall', async()=>{
 const db=await freshDb();const {admin}=await tenant(db,'Reset Hosp')
 await setAccess(db,admin,{role:'nurse',path:'/opd',allowed:false})
 await setAccess(db,admin,{role:'nurse',path:'/ipd',allowed:false})
 await setAccess(db,admin,{role:'doctor',path:'/ipd',allowed:false})
 let m=await resetAccess(db,admin,{role:'nurse'})
 assert.equal(m.removed,2);assert.equal(m.overrides,1)
 await assert.rejects(resetAccess(db,admin,{role:'boss'}),/staff role/)
 m=await resetAccess(db,admin)
 assert.equal(m.removed,1);assert.equal(m.overrides,0)
})

test('favourites follow the effective menu', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Fav Role Hosp')
 const lab=await mk('lab','Leo Lab')
 assert.equal((await recordHit(db,lab,'/pharmacy')).ignored,true)
 await setAccess(db,admin,{role:'lab',path:'/pharmacy',allowed:true})
 assert.notEqual((await recordHit(db,lab,'/pharmacy')).ignored,true)
 await setAccess(db,admin,{role:'lab',path:'/laboratory',allowed:false})
 assert.equal((await recordHit(db,lab,'/laboratory')).ignored,true)
 assert.ok(!(await listFavourites(db,lab)).items.some((i:any)=>i.path==='/laboratory'))
})
