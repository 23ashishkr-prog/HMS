import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {addCatalogItem,updateCatalogItem,listCatalog} from '../lib/services/diagnostics'
test('admin edits an existing service: price, tax, switch off/on; audited; admin-only; isolated',async()=>{const db=await freshDb();const t=await tenant(db,'Svc Edit');const rec=await t.mk('reception','Rec S');const o=await tenant(db,'Svc Other')
 const s=await addCatalogItem(db,t.admin,{code:'cbc',name:'CBC',category:'lab',price:300})
 const u=await updateCatalogItem(db,t.admin,s.id,{price:'350',gstRate:5,sac:'999316',name:'Complete blood count'});assert.equal(Number(u.price),350);assert.equal(Number(u.gst_rate),5);assert.equal(u.sac_code,'999316');assert.equal(u.name,'Complete blood count');assert.equal(u.code,'CBC')
 const a=(await db.query("select details from audit_log where entity='service' and action='update' and entity_id=$1",[s.id])).rows;assert.equal(a.length,1);assert.deepEqual(Object.keys(a[0].details).sort(),['gst_rate','name','price','sac_code'])
 await updateCatalogItem(db,t.admin,s.id,{price:350});assert.equal((await db.query("select count(*)::int n from audit_log where entity='service' and action='update'")).rows[0].n,1,'no-op change is not audited')
 await assert.rejects(updateCatalogItem(db,t.admin,s.id,{price:-1}),/Price/);await assert.rejects(updateCatalogItem(db,t.admin,s.id,{gstRate:7}),/GST/);await assert.rejects(updateCatalogItem(db,t.admin,s.id,{category:'x'}),/category/)
 await assert.rejects(updateCatalogItem(db,rec,s.id,{price:1}),/role|permission|allowed/i);await assert.rejects(updateCatalogItem(db,o.admin,s.id,{price:1}),/not found/)
 await updateCatalogItem(db,t.admin,s.id,{active:false});assert.equal((await listCatalog(db,t.admin)).length,0);assert.equal((await listCatalog(db,t.admin,undefined,true)).length,1);assert.equal((await listCatalog(db,rec,undefined,true)).length,0,'only admin sees switched-off services')
 await updateCatalogItem(db,t.admin,s.id,{active:true});assert.equal((await listCatalog(db,t.admin)).length,1)})
