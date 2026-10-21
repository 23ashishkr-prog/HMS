import {test} from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs'
import {freshDb,tenant} from './helpers'
import {template,runImport} from '../lib/services/bulkimport'
async function xlsx(head:string[],rows:any[][]){const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('s');ws.addRow(head);rows.forEach(r=>ws.addRow(r));return Buffer.from(await wb.xlsx.writeBuffer())}
test('excel import: templates, preview with errors + auto-fixes, dry run saves nothing, commit is idempotent, admin-only, isolated',async()=>{const db=await freshDb();const t=await tenant(db,'Import Care');const rec=await t.mk('reception','Rec I')
 for(const k of ['services','users','departments','doctor_schedules','medicines']){const b=await template(k as any);assert.equal(b.slice(0,2).toString(),'PK')}
 const svc=await xlsx(['Code *','Service name *','Category *','Price (INR) *'],[['opd gen','General consultation','Consult','₹ 1,200'],['CBC','Complete blood count','pathology','350'],['BAD','Bad row','unknown','abc'],['CBC','Dup','lab','1']])
 await assert.rejects(runImport(db,rec,'services',svc,'s.xlsx',true),/role/)
 const dry=await runImport(db,t.admin,'services',svc,'s.xlsx',true);assert.equal(dry.summary.create,2);assert.equal(dry.summary.errors,2);assert.ok(dry.rows[0].fixes.some((f:string)=>/OPD-GEN/.test(f)));assert.equal(dry.rows[0].data.price,1200);assert.equal(dry.rows[1].data.category,'lab')
 assert.equal((await db.query("select count(*)::int n from service_catalog where hospital_id=$1 and code in ('OPD-GEN','CBC')",[t.admin.hospitalId])).rows[0].n,0,'dry run saves nothing')
 const c1=await runImport(db,t.admin,'services',svc,'s.xlsx',false);assert.equal(c1.summary.create,2);const c2=await runImport(db,t.admin,'services',svc,'s.xlsx',false);assert.equal(c2.summary.create,0);assert.equal(c2.summary.update,2)
 assert.equal((await db.query("select count(*)::int n from service_catalog where hospital_id=$1 and code='CBC'",[t.admin.hospitalId])).rows[0].n,1)
 const us=await xlsx(['Full name','E-mail (login)','Role','Mobile','Department'],[['Dr Anita Rao','ANITA@x.in','Consultant','98765 43210','Medicine'],['Nina','nina@x.in','Sister','',''],['Bad','not-an-email','wizard','12','']])
 const u=await runImport(db,t.admin,'users',us,'u.xlsx',false);assert.equal(u.summary.create,2);assert.equal(u.summary.errors,1);assert.equal(u.summary.newUsers,2)
 const sch=await xlsx(['Doctor e-mail','Day','Start','End','Slot minutes'],[['anita@x.in','Mon-Sat','9am','1.30pm','15'],['anita@x.in','Sun','17:00','16:00',''],['ghost@x.in','Mon','9','12','']])
 const s=await runImport(db,t.admin,'doctor_schedules',sch,'d.xlsx',false);assert.equal(s.summary.create,1);assert.equal(s.summary.errors,2);assert.equal((await db.query("select count(*)::int n from doctor_availability a join users u on u.id=a.doctor_user_id where u.email='anita@x.in'")).rows[0].n,6)
 const med=await xlsx(['Medicine','Strength','Form','MRP per unit','Reorder level','Batch no.','Expiry','Quantity'],[['Paracetamol','500 mg','Tablet','2.5','100','P1','03/2030','500'],['Old','1','tab','1','0','X','2001-01-01','5']])
 const m1=await runImport(db,t.admin,'medicines',med,'m.xlsx',false);assert.equal(m1.summary.create,1);assert.equal(m1.rows[0].data.expiry,'2030-03-31');await runImport(db,t.admin,'medicines',med,'m.xlsx',false)
 assert.equal((await db.query("select count(*)::int n,sum(quantity)::int q from medicine_batches where batch_no='P1'")).rows[0].q,500,'re-import does not double stock')
 await assert.rejects(runImport(db,t.admin,'services',Buffer.from('not excel'),'x.xlsx',true),/xlsx/)
 await assert.rejects(runImport(db,t.admin,'services',await xlsx(['Name'],[['x']]),'x.xlsx',true),/Missing columns/)
 const o=await tenant(db,'Import Other');assert.equal((await db.query("select count(*)::int n from service_catalog where hospital_id=$1 and code='CBC'",[o.admin.hospitalId])).rows[0].n,0)
 assert.ok((await db.query("select 1 from audit_log where hospital_id=$1 and action='bulk_import'",[t.admin.hospitalId])).rows.length>=4)})
