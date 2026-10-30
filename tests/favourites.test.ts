import {test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {NAV} from '../lib/nav'
import {listFavourites,recordHit,setFavourite} from '../lib/services/favourites'

test('payments and users are settings sections, not sidebar items',()=>{
 assert.equal(NAV.some(n=>n.name==='Payments'||n.path==='/settings/payments'),false)
 assert.equal(NAV.some(n=>n.name==='Users & access'||n.path==='/admin/users'),false)
 const settings=NAV.find(n=>n.path==='/admin/settings')
 assert.ok(settings)
 assert.deepEqual(settings!.roles.slice().sort(),['admin','billing'])
})

test('favourites are private, manual stars win, and auto items can be dismissed', async()=>{
 const db=await freshDb()
 const {admin,mk}=await tenant(db,'Fav Hosp','basic')
 const bill=await mk('billing','Bea Bills')
 const other=await tenant(db,'Other Fav','basic')
 for(let i=0;i<4;i++)await recordHit(db,admin,'/billing')
 assert.equal((await recordHit(db,admin,'/admin/users')).ignored,true)
 assert.equal((await recordHit(db,admin,'/billing?patient=secret')).ignored,true)
 assert.ok(!(await listFavourites(db,admin)).items.some(i=>i.path==='/billing'))
 await db.query(`update user_nav_usage set last_day=((now() at time zone 'Asia/Kolkata')::date - 1) where user_id=$1 and path='/billing'`,[admin.userId])
 await recordHit(db,admin,'/billing')
 let mine=await listFavourites(db,admin)
 assert.ok(mine.items.some(i=>i.path==='/billing'&&i.auto&&!i.starred))
 assert.equal((await listFavourites(db,bill)).items.length,0)
 assert.equal((await listFavourites(db,other.admin)).items.length,0)
 for(let i=0;i<5;i++)await recordHit(db,admin,'/dashboard')
 assert.ok(!(await listFavourites(db,admin)).items.some(i=>i.path==='/dashboard'))
 const starred=await setFavourite(db,bill,{path:'/billing',starred:true})
 assert.equal(starred.items[0].path,'/billing');assert.equal(starred.items[0].starred,true);assert.equal(starred.items[0].auto,false)
 assert.equal((await listFavourites(db,admin)).items.filter(i=>i.path==='/billing'&&i.starred).length,0)
 await setFavourite(db,admin,{path:'/billing',dismissed:true})
 assert.ok(!(await listFavourites(db,admin)).items.some(i=>i.path==='/billing'))
 const back=await setFavourite(db,admin,{path:'/billing',starred:true})
 assert.ok(back.items.some(i=>i.path==='/billing'&&i.starred))
 const unstarred=await setFavourite(db,admin,{path:'/billing',starred:false})
 assert.ok(unstarred.items.some(i=>i.path==='/billing'&&i.auto&&!i.starred))
 const home=await setFavourite(db,admin,{path:'/dashboard',starred:true})
 assert.equal(home.items[0].path,'/dashboard')
 await assert.rejects(setFavourite(db,admin,{path:'/nope',starred:true}),(e:any)=>e.status===400)
 const rows=(await db.query('select user_id from user_nav_usage where hospital_id=$1',[admin.hospitalId])).rows
 assert.ok(rows.every((r:any)=>r.user_id===admin.userId||r.user_id===bill.userId))
})
