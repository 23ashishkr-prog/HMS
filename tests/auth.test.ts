import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb} from './helpers';import {onboardHospital} from '../lib/services/tenancy';import {authenticate,tx} from '../lib/services/auth'
test('regression: hospital sign-up then login (case/whitespace, codes, rollback)', async()=>{
 const db=await freshDb();const pw='Str0ng@Pass#29'
 const h=await tx(db,d=>onboardHospital(d,{hospitalName:'sudipta_Test',adminName:'Owner',adminEmail:'  Owner.Test@Gmail.com ',password:pw}))
 assert.equal(h.code,'SUDIPTA')
 const u=await authenticate(db,'owner.test@gmail.com',pw);assert.equal(u.hospital_id,h.hospitalId);assert.equal(u.role,'admin')
 await authenticate(db,' OWNER.TEST@GMAIL.COM ',pw);await authenticate(db,'owner.test@gmail.com',pw,'sudipta')
 await assert.rejects(authenticate(db,'owner.test@gmail.com','wrong-password'),(e:any)=>e.status===401)
 await assert.rejects(authenticate(db,'owner.test@gmail.com',pw,'OTHER'),(e:any)=>e.status===401)
 // same email in a second hospital → login asks for hospital code
 await tx(db,d=>onboardHospital(d,{hospitalName:'Second Hosp',adminName:'Owner',adminEmail:'owner.test@gmail.com',password:pw,paid:true}))
 await assert.rejects(authenticate(db,'owner.test@gmail.com',pw),(e:any)=>e.status===409&&e.needHospitalCode)
 // failed sign-up leaves nothing behind (so the user can retry with the same name)
 await assert.rejects(tx(db,d=>onboardHospital(d,{hospitalName:'Broken Hosp',adminName:'',adminEmail:'b@b.in',password:pw})))
 assert.equal((await db.query("select count(*)::int n from hospitals where code='BROKENHOSP'")).rows[0].n,0)
})
