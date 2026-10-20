import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {saveTemplate,listTemplates,useTemplate,deleteTemplate} from '../lib/services/templates'
import {addCatalogItem} from '../lib/services/diagnostics'
test('templates: personal vs shared, normalisation, order-set validation, usage, ownership, tenant isolation',async()=>{const db=await freshDb();const {admin,mk}=await tenant(db,'Tpl Hosp');const d1=await mk('doctor','Dr One'),d2=await mk('doctor','Dr Two')
 const cbc=await addCatalogItem(db,admin,{code:'CBC',name:'CBC',category:'lab',price:300})
 const t=await saveTemplate(db,d1,{name:'Viral fever',diagnoses:[{icd10Code:'',description:'Viral fever'}],rx:[{medicine:'Paracetamol 650 mg',frequency:'TDS',duration:'3d'}],orderServiceIds:[cbc.id],advice:'Fluids'})
 await assert.rejects(saveTemplate(db,d1,{name:'viral FEVER',rx:[{medicine:'X'}]}),(e:any)=>e.status===409)
 await assert.rejects(saveTemplate(db,d1,{name:'Empty'}),(e:any)=>e.status===400)
 await assert.rejects(saveTemplate(db,d1,{name:'Bad',orderServiceIds:['00000000-0000-4000-8000-000000000000']}),(e:any)=>e.status===400)
 const sh=await saveTemplate(db,admin,{name:'Shared HTN',shared:true,rx:[{medicine:'Amlodipine 5 mg',frequency:'OD',duration:'30 days'}]})
 const l1=await listTemplates(db,d1),l2=await listTemplates(db,d2);assert.equal(l1.length,2);assert.equal(l2.length,1);assert.equal(l2[0].id,sh.id)
 const u=await useTemplate(db,d1,t.id);assert.equal(u.rx[0].frequency,'1-1-1');assert.equal(u.rx[0].duration,'3 days');assert.equal(u.uses,1)
 await assert.rejects(useTemplate(db,d2,t.id),(e:any)=>e.status===404);await assert.rejects(saveTemplate(db,d2,{name:'hijack',rx:[{medicine:'x'}]},t.id),(e:any)=>e.status===403)
 await assert.rejects(deleteTemplate(db,d2,sh.id),(e:any)=>e.status===404)
 const o=await tenant(db,'Other Tpl');const od=await o.mk('doctor','Dr Out');await assert.rejects(useTemplate(db,od,t.id),(e:any)=>e.status===404)
 assert.deepEqual(await deleteTemplate(db,d1,t.id),{deleted:true})})
