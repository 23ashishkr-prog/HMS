import {test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {frontDeskVisit} from '../lib/services/flows'
import {registerPatient} from '../lib/services/patients'
import {checkIn} from '../lib/services/opd'
import {addCatalogItem} from '../lib/services/diagnostics'
import {widgetData} from '../lib/services/widgets'
import {dashboard} from '../lib/services/dashboard'
import {doctorStatuses,istToUtc} from '../lib/services/doctorsched'
import {startEncounter} from '../lib/services/opd'
import {saveNursing} from '../lib/services/opd'
import {authenticate} from '../lib/services/auth'
import {listDismissals,setDismissal} from '../lib/services/dismissals'
import {homeForRole} from '../lib/auth'
import {listHospitalGatewayPayments} from '../lib/services/hospitalGateway'

test('clinic front-desk cash is a receipt in today\'s collections, and the name is not re-cased',async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Sudipta Desk','clinic');const rec=await mk('reception','Desk R');const doc=await mk('doctor','Dr A')
 await addCatalogItem(db,admin,{code:'OPD',name:'Consultation',category:'consultation',price:1000})
 const v=await frontDeskVisit(db,rec,{patient:{fullName:'QA Patient Ravi',mobile:'9123456780',gender:'Male'},doctorId:doc.userId,collectMode:'cash',reference:'CASH-1'})
 assert.equal(v.patient.full_name,'QA Patient Ravi')
 assert.equal(v.token.token_no,1)
 assert.equal(v.bill!.kind,'receipt');assert.equal(v.bill!.paid,1000);assert.equal(v.bill!.balance,0)
 assert.equal((await db.query('select count(*)::int n from invoices where hospital_id=$1',[admin.hospitalId])).rows[0].n,0)
 const w=await widgetData(db,rec,['collections']);assert.equal(w.collections.total,1000);assert.equal(w.collections.n,1)
 assert.equal((await dashboard(db,admin)).collections_today,1000)
 const list=await listHospitalGatewayPayments(db,admin,{})
 assert.equal(list.payments.some((p:any)=>p.source==='receipt'&&Number(p.amount_inr)===1000),true)
 assert.equal(list.stats.reconciled,true)
 assert.equal(list.stats.receipts_total,1000)
})

test('token numbers stay unique for one doctor on one day when check-ins overlap',async()=>{
 const db=await freshDb();const {mk}=await tenant(db,'Tok Race','clinic');const rec=await mk('reception','Desk T');const doc=await mk('doctor','Dr T')
 const ids=[]
 for(let i=1;i<=4;i++)ids.push((await registerPatient(db,rec,{fullName:'P'+i,mobile:'900000000'+i,gender:'Male'})).id)
 const tokens=await Promise.all(ids.map(id=>checkIn(db,rec,{patientId:id,doctorId:doc.userId})))
 assert.deepEqual(tokens.map(t=>t.token_no).sort((a,b)=>a-b),[1,2,3,4])
})

test('a doctor with no personal schedule is available, not off duty',async()=>{
 const db=await freshDb();const t=await tenant(db,'Open Docs','clinic');const doc=await t.mk('doctor','Dr Open')
 const early=await doctorStatuses(db,t.admin.hospitalId,istToUtc('2026-10-27',8*60))
 const late=await doctorStatuses(db,t.admin.hospitalId,istToUtc('2026-10-27',20*60))
 assert.equal(early.find(x=>x.id===doc.userId)!.unscheduled,true)
 assert.equal(early.find(x=>x.id===doc.userId)!.status,'available')
 assert.equal(late.find(x=>x.id===doc.userId)!.status,'available')
})

test('nurse saves vitals and a note without a prescription',async()=>{
 const db=await freshDb();const {mk}=await tenant(db,'Nurse Desk','clinic');const rec=await mk('reception','Desk N');const doc=await mk('doctor','Dr N');const nurse=await mk('nurse','Nurse N')
 const v=await frontDeskVisit(db,rec,{patient:{fullName:'QA Patient Ravi',mobile:'9123456781',gender:'Female'},doctorId:doc.userId})
 const e=await startEncounter(db,nurse,{queueId:v.token.id})
 const saved=await saveNursing(db,nurse,{encounterId:e.id,vitals:{pulse:72,spo2:98},notes:'Alert, walking'})
 assert.equal(saved.saved,true)
 const notes=(await db.query('select summary from clinical_notes where patient_id=$1',[v.patient.id])).rows
 assert.match(notes[0].summary,/Alert, walking/)
 assert.equal((await db.query('select count(*)::int n from prescriptions where patient_id=$1',[v.patient.id])).rows[0].n,0)
})

test('AI upsell dismissal is private per user',async()=>{
 const db=await freshDb();const {admin,mk}=await tenant(db,'Dismiss','clinic');const other=await mk('reception','Other')
 assert.deepEqual((await listDismissals(db,admin)).keys,[])
 await setDismissal(db,admin,{key:'ai_upsell',dismissed:true})
 assert.deepEqual((await listDismissals(db,admin)).keys,['ai_upsell'])
 assert.deepEqual((await listDismissals(db,other)).keys,[])
})

test('billing role on Clinic lands on home; a costly hash is rewritten to cost 10',async()=>{
 assert.equal(homeForRole('billing',['patients','queue','opd']),'/dashboard')
 assert.equal(homeForRole('billing',['patients','billing']),'/billing')
 const db=await freshDb();const {h}=await tenant(db,'Login Fast','clinic')
 await db.query("update users set password_hash=crypt($2,gen_salt('bf',12)) where id=$1",[h.adminUserId,'S3cure-pass!'])
 const u=await authenticate(db,'admin@loginfast.in','S3cure-pass!')
 const hash=(await db.query('select password_hash from users where id=$1',[u.id])).rows[0].password_hash
 assert.match(String(hash),/^\$2[ab]\$10\$/)
})
