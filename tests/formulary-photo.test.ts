import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {addMedicine,receiveStock,formulary} from '../lib/services/pharmacy'
import {setMyPhoto,listStaff} from '../lib/services/tenancy'
import {doctorStatuses} from '../lib/services/doctorsched'
const rejects=(p:Promise<unknown>,status:number)=>assert.rejects(p,(e:any)=>e.status===status)
const PNG='data:image/jpeg;base64,'+'A'.repeat(200)

test('doctor sees the pharmacy formulary with stock, in-stock first; billing cannot', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Formulary Hospital');const doc=await mk('doctor','Dr Rx'),ph=await mk('pharmacy','Ph'),bill=await mk('billing','B')
 const a=await addMedicine(db,ph,{name:'Zinc',strength:'20mg',form:'tablet',unitPrice:2});await addMedicine(db,ph,{name:'Amoxicillin',strength:'500mg',form:'capsule',unitPrice:5})
 await receiveStock(db,ph,{medicineId:a.id,batchNo:'Z1',expiryDate:'2030-01-01',quantity:40})
 const f=await formulary(db,doc);assert.deepEqual(f.map((m:any)=>[m.name,m.in_stock]),[['Zinc',40],['Amoxicillin',0]]);assert.equal(f[0].unit_price,undefined,'no prices for doctors')
 await rejects(formulary(db,bill),403);assert.ok((await formulary(db,admin)).length===2)
})

test('any staff member sets and removes their own photo; doctor availability carries it', async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Photo Hospital');const doc=await mk('doctor','Dr Pic')
 await setMyPhoto(db,doc,PNG);assert.equal((await listStaff(db,admin)).find((u:any)=>u.id===doc.userId).photo_url,PNG)
 assert.equal((await doctorStatuses(db,doc.hospitalId)).find(d=>d.id===doc.userId)!.photo_url,PNG)
 await rejects(setMyPhoto(db,doc,'javascript:alert(1)'),400)
 await setMyPhoto(db,doc,null);assert.equal((await listStaff(db,admin)).find((u:any)=>u.id===doc.userId).photo_url,null)
})
