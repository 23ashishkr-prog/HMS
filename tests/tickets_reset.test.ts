import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {raiseTicket,listHospitalTickets,listPlatformIncidents} from '../lib/services/tickets'
import {platformResetAdminPassword,platformListHospitalAdmins,createStaff} from '../lib/services/tenancy'
import {recordIncident} from '../lib/services/incidents'

test('admin tickets are tenant-scoped; other roles cannot raise; platform lists them separately from auto errors',async()=>{
 const db=await freshDb()
 const a=await tenant(db,'TixA '+Math.random())
 const b=await tenant(db,'TixB '+Math.random())
 const doc=await a.mk('doctor','Doc A')
 await assert.rejects(raiseTicket(db as any,doc,{title:'Nope',description:'Doctors cannot raise'}),/admin|forbidden|role/i)
 const t=await raiseTicket(db as any,a.admin,{title:'Printer down',description:'OPD printer offline',severity:'high',category:'bug'})
 assert.equal(t.ticket.source||'admin_ticket','admin_ticket')
 assert.equal(t.ticket.title,'Printer down')
 const mine=await listHospitalTickets(db as any,a.admin)
 assert.equal(mine.length,1)
 assert.equal(mine[0].title,'Printer down')
 await assert.rejects(listHospitalTickets(db as any,doc),/admin|forbidden|role/i)
 // other hospital cannot see via hospital API
 const other=await listHospitalTickets(db as any,b.admin)
 assert.equal(other.length,0)
 await recordIncident(db as any,{source:'server',message:'boom at /api/x',route:'/api/x',hospitalId:a.h.hospitalId})
 const tickets=await listPlatformIncidents(db as any,{kind:'tickets'})
 assert.ok(tickets.some((x:any)=>x.title==='Printer down'&&x.source==='admin_ticket'))
 const errors=await listPlatformIncidents(db as any,{kind:'errors'})
 assert.ok(errors.every((x:any)=>x.source!=='admin_ticket'))
 assert.ok(errors.some((x:any)=>/boom/.test(x.message)))
})

test('platform reset admin password sets must_change_password, audits without storing password, cannot hit other hospital by id mix-up',async()=>{
 const db=await freshDb()
 const a=await tenant(db,'RstA '+Math.random())
 const b=await tenant(db,'RstB '+Math.random())
 const plat={id:'plat-1',email:'owner@example.com'}
 const listed=await platformListHospitalAdmins(db as any,a.h.hospitalId)
 assert.ok(listed.admins.length>=1)
 const r=await platformResetAdminPassword(db as any,a.h.hospitalId,{},plat)
 assert.equal(r.mustChangePassword,true)
 assert.ok(r.temporaryPassword&&r.temporaryPassword.length>=10)
 assert.equal(r.email,listed.admins[0].email)
 const row=(await db.query('select must_change_password m from users where id=$1',[r.userId])).rows[0]
 assert.equal(row.m,true)
 const aud=(await db.query("select action,details from audit_log where action='platform_reset_admin_password' and entity_id=$1",[r.userId])).rows[0]
 assert.ok(aud)
 const details=typeof aud.details==='string'?JSON.parse(aud.details):aud.details
 assert.equal(details.targetEmail,r.email)
 assert.ok(!JSON.stringify(details).includes(r.temporaryPassword))
 // cross-tenant: admin user id from B with hospital A id must 404
 await assert.rejects(
  platformResetAdminPassword(db as any,a.h.hospitalId,{userId:b.h.adminUserId},plat),
  /not found/i
 )
 // staff in hospital cannot call platform function — there is no hospital API; ensure createStaff doctor cannot reset via tenancy hospital path for other hospital
 const doc=await createStaff(db as any,a.admin,{fullName:'D',email:'d@a.test',role:'doctor',password:'0123456789x'})
 await assert.rejects(
  platformResetAdminPassword(db as any,b.h.hospitalId,{userId:doc.id},plat),
  /not found/i
 )
})
