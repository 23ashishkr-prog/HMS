import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {createStaff,updateStaff,resetStaffPassword,listStaff} from '../lib/services/tenancy'
test('admin manages users only inside own hospital; changes are audited',async()=>{const db=await freshDb();const a=await tenant(db,'UA '+Math.random(),'enterprise');const b=await tenant(db,'UB '+Math.random(),'enterprise')
 const admA=await a.mk('admin','Admin A');const admB=await b.mk('admin','Admin B')
 const u=await createStaff(db as any,admA,{fullName:'Dr New',email:'drnew@a.test',role:'doctor',password:'0123456789x',phone:'+91 98765 43210',department:'Medicine',registrationNo:'DMC/1'})
 const row=(await listStaff(db as any,admA)).find((x:any)=>x.id===u.id);assert.equal(row.department,'Medicine');assert.equal(row.registration_no,'DMC/1');assert.equal(row.must_change_password,true)
 await assert.rejects(updateStaff(db as any,admB,u.id,{fullName:'Hijack'}),/not found/i)
 await assert.rejects(resetStaffPassword(db as any,admB,u.id,'0123456789zz'),/not found/i)
 const recA=await a.mk('reception','Rec A');await assert.rejects(updateStaff(db as any,recA,u.id,{fullName:'x'}))
 await updateStaff(db as any,admA,u.id,{role:'nurse',active:false});const r2=(await db.query('select role,active from users where id=$1',[u.id])).rows[0];assert.equal(r2.role,'nurse');assert.equal(r2.active,false)
 await assert.rejects(updateStaff(db as any,admA,admA.userId,{active:false}),/yourself/)
 await assert.rejects(updateStaff(db as any,admA,admA.userId,{role:'lab'}),/own role/)
 await resetStaffPassword(db as any,admA,u.id,'abcdefghijk1');assert.equal((await db.query('select must_change_password m from users where id=$1',[u.id])).rows[0].m,true)
 const acts=(await db.query("select action from audit_log where hospital_id=$1 and entity='user' order by created_at",[admA.hospitalId])).rows.map((r:any)=>r.action);assert.ok(acts.includes('create')&&acts.includes('update')&&acts.includes('reset_password'))
 assert.equal((await db.query("select count(*)::int n from audit_log where hospital_id=$1 and entity_id=$2",[admB.hospitalId,u.id])).rows[0].n,0)})
