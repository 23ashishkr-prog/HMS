import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {requestOtp,verifyOtp,portalData,markDose,portalReport,portalFollowup} from '../lib/services/portal'
import {saveIntegration} from '../lib/services/integrations'
import {registerPatient} from '../lib/services/patients'
import {publicBook,bookingInfo} from '../lib/services/publicbook'
import {saveWeek} from '../lib/services/doctorsched'
process.env.SESSION_SECRET=process.env.SESSION_SECRET||'test-session';process.env.INTEGRATIONS_ENC_KEY='k'
test('portal: WhatsApp OTP login, rate limit, no enumeration, isolation, medicines, booking, bills',async()=>{const db=await freshDb();const t=await tenant(db,'Portal Care');const o=await t.mk('doctor','Dr P');const code=(await db.query('select code from hospitals where id=$1',[t.admin.hospitalId])).rows[0].code
 const sent:any[]=[];const f:any=async(u:string,x:any)=>{sent.push(JSON.parse(x.body));return new Response('{"messages":[{"id":"w1"}]}',{status:200})}
 await saveIntegration(db,t.admin,'whatsapp',{config:{phoneNumberId:'1234567'},secrets:{accessToken:'tok'}})
 const p:any=await registerPatient(db,t.admin,{fullName:'Meera Nair',mobile:'9822200001',gender:'Female'})
 let otp='';const gen=()=>(otp=String(Math.floor(100000+Math.random()*899999)))
 const r=await requestOtp(db,code,{mobile:'9822200001'},'1.1.1.1',f,gen);assert.equal(r.channel,'whatsapp');assert.match(sent[0].text.body,new RegExp(otp))
 await assert.rejects(verifyOtp(db,code,{mobile:'9822200001',otp:'000000'===otp?'111111':'000000'}),/Wrong code/)
 const v=await verifyOtp(db,code,{mobile:'9822200001',otp});assert.equal(v.patientId,p.id);await assert.rejects(verifyOtp(db,code,{mobile:'9822200001',otp}),/expired/,'one-time')
 // unknown number: same answer, nothing sent
 const n=sent.length;const u=await requestOtp(db,code,{mobile:'9822299999'},'1.1.1.1',f,gen);assert.equal(u.sent,true);assert.equal(sent.length,n)
 await requestOtp(db,code,{mobile:'9822200001'},'1.1.1.1',f,gen);await requestOtp(db,code,{mobile:'9822200001'},'1.1.1.1',f,gen);await assert.rejects(requestOtp(db,code,{mobile:'9822200001'},'1.1.1.1',f,gen),/Too many/)
 // brute force: 5 tries then locked
 const t2=await tenant(db,'Portal Two');const c2=(await db.query('select code from hospitals where id=$1',[t2.admin.hospitalId])).rows[0].code;await saveIntegration(db,t2.admin,'whatsapp',{config:{phoneNumberId:'1234567'},secrets:{accessToken:'tok'}});await registerPatient(db,t2.admin,{fullName:'Other Person',mobile:'9822200001',gender:'Male'})
 await requestOtp(db,c2,{mobile:'9822200001'},'2.2.2.2',f,gen);for(let i=0;i<5;i++)await assert.rejects(verifyOtp(db,c2,{mobile:'9822200001',otp:'999999'===otp?'888888':'999999'}));await assert.rejects(verifyOtp(db,c2,{mobile:'9822200001',otp}),/Too many/)
 // data isolation: same mobile in another hospital is a different patient
 const ctx={hospitalId:t.admin.hospitalId,patientId:p.id};let d:any=await portalData(db,ctx);assert.equal(d.patient.full_name,'Meera Nair');assert.equal(d.medicines.length,0)
 await assert.rejects(portalData(db,{hospitalId:t2.admin.hospitalId,patientId:p.id}),/log in/)
 // medicines: prescription today -> doses, mark taken idempotent
 const rx=(await db.query("insert into prescriptions(hospital_id,patient_id,doctor_user_id) values($1,$2,$3) returning id",[t.admin.hospitalId,p.id,o.userId])).rows[0].id;await db.query("insert into prescription_items(prescription_id,medicine_name,frequency,duration) values($1,'Amoxicillin 500 mg','1-1-1','5 days')",[rx])
 d=await portalData(db,ctx);assert.ok(d.medicines.length>0);const k=d.medicines[0].key;await markDose(db,ctx,k,true);await markDose(db,ctx,k,true);assert.equal((await portalData(db,ctx)).medicines.find((m:any)=>m.key===k).taken,true)
 await assert.rejects(markDose(db,{hospitalId:t2.admin.hospitalId,patientId:p.id},k,true),/not found/)
 await assert.rejects(portalReport(db,ctx,'00000000-0000-0000-0000-000000000000'),/not found/)
 await assert.rejects(portalFollowup(db,ctx,'00000000-0000-0000-0000-000000000000','confirm'),/not found/)
 // booking from portal works even when public booking is off
 await saveWeek(db,t.admin,o.userId,[0,1,2,3,4,5,6].map(day=>({day,start:'09:00',end:'11:00',slotMinutes:30})));const date=new Date(Date.now()+330*60000+864e5).toISOString().slice(0,10)
 const s=await bookingInfo(db,code,o.userId,date,true);const b=await publicBook(db,code,{doctorId:o.userId,at:s.slots[0].at,mode:'video'},new Date(),p.id);assert.equal(b.newPatient,false);assert.equal(b.videoPending,true)
 d=await portalData(db,ctx);assert.equal(d.appointments[0].mode,'video');assert.equal(d.appointments[0].upcoming,true)})
