import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {addMedicine,receiveStock} from '../lib/services/pharmacy'
import * as R from '../lib/services/reorder'
test('reorder: alerts, suppliers, draft POs grouped, no double-ordering, order/receive/close, guards, auto-draft cron',async()=>{const db=await freshDb();const {h,admin,mk}=await tenant(db,'Ph Ro');const ph=await mk('pharmacy','Ph R'),doc=await mk('doctor','Dr Ro')
 const para=await addMedicine(db,ph,{name:'Paracetamol',strength:'650 mg',form:'tab',unitPrice:2,reorderLevel:100});const amox=await addMedicine(db,ph,{name:'Amoxicillin',strength:'500 mg',form:'cap',unitPrice:5,reorderLevel:50});const ok=await addMedicine(db,ph,{name:'ORS',form:'sachet',unitPrice:10,reorderLevel:10})
 await receiveStock(db,ph,{medicineId:para.id,batchNo:'P1',expiryDate:'2030-01-01',quantity:40});await receiveStock(db,ph,{medicineId:ok.id,batchNo:'O1',expiryDate:'2030-01-01',quantity:500})
 let al=await R.reorderAlerts(db,h.hospitalId);assert.deepEqual(al.map((x:any)=>x.name).sort(),['Amoxicillin','Paracetamol']);assert.equal(al.find((x:any)=>x.name==='Paracetamol').suggest_qty,160)
 await assert.rejects(R.saveSupplier(db,ph,{name:'X',gstin:'BAD'}),(e:any)=>e.status===400)
 const s=await R.saveSupplier(db,ph,{name:'MedDist',phone:'9876500123',gstin:'27ABCDE1234F1Z5'});await R.setMedicineReorder(db,ph,para.id,{supplierId:s.id})
 await assert.rejects(R.listSuppliers(db,doc),(e:any)=>e.status===403)
 const d=await R.draftPOs(db,ph);assert.equal(d.created.length,2)
 al=await R.reorderAlerts(db,h.hospitalId);assert.ok(al.every((x:any)=>x.suggest_qty===0)) // already on order
 assert.equal((await R.draftPOs(db,ph)).created.length,0)
 const pos=await R.listPOs(db,ph);const p1=pos.find((p:any)=>p.supplier==='MedDist')!,p2=pos.find((p:any)=>!p.supplier_id)!
 await assert.rejects(R.updatePO(db,ph,p2.id,{action:'order'}),(e:any)=>e.status===400)
 await assert.rejects(R.receivePO(db,ph,p1.id,{lines:[{itemId:p1.items[0].id,quantity:10,batchNo:'B',expiryDate:'2030-01-01'}]}),(e:any)=>e.status===409)
 await R.updatePO(db,ph,p1.id,{action:'edit',items:[{id:p1.items[0].id,quantity:200,unitCost:1.5}]});assert.equal((await R.updatePO(db,ph,p1.id,{action:'order'})).status,'ordered')
 await assert.rejects(R.receivePO(db,ph,p1.id,{lines:[{itemId:p1.items[0].id,quantity:300,batchNo:'B',expiryDate:'2030-01-01'}]}),(e:any)=>e.status===400)
 let r=await R.receivePO(db,ph,p1.id,{lines:[{itemId:p1.items[0].id,quantity:120,batchNo:'B2',expiryDate:'2029-06-30'}]});assert.equal(r.status,'partially_received')
 r=await R.receivePO(db,ph,p1.id,{lines:[{itemId:p1.items[0].id,quantity:80,batchNo:'B3',expiryDate:'2029-07-31'}]});assert.equal(r.status,'received')
 const b=(await db.query("select unit_cost,po_item_id from medicine_batches where batch_no='B2'")).rows[0];assert.equal(Number(b.unit_cost),1.5);assert.ok(b.po_item_id)
 assert.ok(!(await R.reorderAlerts(db,h.hospitalId)).some((x:any)=>x.name==='Paracetamol'))
 assert.equal((await R.updatePO(db,ph,p2.id,{action:'cancel'})).status,'cancelled')
 await db.query('update hospitals set auto_reorder=true where id=$1',[h.hospitalId]);assert.equal((await R.autoReorderAll(db)).autoPOs,1);assert.equal((await R.autoReorderAll(db)).autoPOs,0)
 const o=await tenant(db,'Ph Other');const oph=await o.mk('pharmacy','Ph O');await assert.rejects(R.updatePO(db,oph,p1.id,{action:'cancel'}),(e:any)=>e.status===404)})
