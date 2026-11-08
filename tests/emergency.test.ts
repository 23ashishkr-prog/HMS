import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addBed} from '../lib/services/ipd'
import {registerVisit,triage,board,markSeen,assignDoctor,dispose,markMlc,amendMlc,recordIntimation,setMlcStatus,getMlc,getVisit,mlcRegister,mlcCsv,identify,doorToDoctor} from '../lib/services/emergency'

test('ER: quick register (unknown patient), triage + re-triage history, board order, door-to-doctor', async()=>{
 const db=await freshDb();const t=await tenant(db,'City Emergency');const nurse=await t.mk('nurse','Sister ER'),doc=await t.mk('doctor','Dr Casualty'),rec=await t.mk('reception','ER Desk')
 const now=Date.now(),ago=(m:number)=>new Date(now-m*60000).toISOString()
 const u=await registerVisit(db,nurse,{unknown:true,gender:'Male',approxAge:40,arrivalMode:'ambulance_108',arrivedAt:ago(50),chiefComplaint:'Head injury, unconscious'})
 assert.equal(u.patient.full_name,'Unknown Male ~40');assert.equal(u.unknown_patient,true);assert.match(u.visit_no,/\/ER\/\d{4}\/00001$/)
 const p=await registerPatient(db,rec,{fullName:'Ravi Kumar',mobile:'9876500001'})
 const g=await registerVisit(db,rec,{patientId:p.id,arrivedAt:ago(90),chiefComplaint:'Sprain',triageLevel:'red'});assert.equal(g.triage_level,null,'reception cannot triage; visit still registered')
 await assert.rejects(registerVisit(db,rec,{patientId:p.id}),(e:any)=>e.status===409,'already on the board')
 const y=await registerVisit(db,nurse,{fullName:'Meena Devi',gender:'Female',arrivedAt:ago(20),triageLevel:'yellow',pulse:110,spo2:96})
 assert.equal(y.triage_level,'yellow');assert.equal(y.triage_vitals.pulse,110)
 const un=await registerVisit(db,rec,{fullName:'Not Triaged',arrivedAt:ago(5)})
 await assert.rejects(triage(db,rec,u.id,{level:'red'}),(e:any)=>e.status===403)
 await assert.rejects(triage(db,nurse,u.id,{level:'purple'}),(e:any)=>e.status===400)
 await assert.rejects(triage(db,nurse,u.id,{level:'red',spo2:140}),(e:any)=>e.status===400)
 await triage(db,nurse,u.id,{level:'orange',gcs:9,bpSys:90,bpDia:60,avpu:'v'})
 await assert.rejects(triage(db,nurse,u.id,{level:'red'}),(e:any)=>e.status===400,'re-triage to a new colour needs a reason')
 const rt=await triage(db,nurse,u.id,{level:'red',gcs:7,note:'GCS falling'});assert.equal(rt.triage_level,'red');assert.equal(rt.triage_vitals.avpu,undefined)
 await triage(db,nurse,g.id,{level:'green',pain:3})
 const v=await getVisit(db,nurse,u.id);assert.deepEqual(v.triages.map((x:any)=>x.level),['orange','red']);assert.equal(v.triages[0].vitals.avpu,'V')
 const b=await board(db,nurse);assert.deepEqual(b.visits.map((x:any)=>x.id),[u.id,un.id,y.id,g.id],'red, untriaged, yellow, green')
 assert.equal(b.counts.red,1);assert.equal(b.counts.untriaged,1);const red=b.visits[0];assert.equal(red.targetMin,0);assert.equal(red.overdue,true);assert.ok(red.waitingMin>=49)
 // two greens: longer wait first
 const g2=await registerVisit(db,nurse,{fullName:'Second Green',arrivedAt:ago(200),triageLevel:'green'})
 assert.deepEqual((await board(db,nurse)).visits.filter((x:any)=>x.triage_level==='green').map((x:any)=>x.id),[g2.id,g.id])
 await assert.rejects(markSeen(db,nurse,u.id),(e:any)=>e.status===403)
 const s=await markSeen(db,doc,u.id);assert.equal(s.doctor_id,doc.userId);const s2=await markSeen(db,doc,u.id);assert.equal(new Date(s2.doctor_seen_at).getTime(),new Date(s.doctor_seen_at).getTime(),'clock stops once')
 const after=(await board(db,nurse)).visits.find((x:any)=>x.id===u.id);assert.ok(after.doorToDoctorMin>=49&&after.doorToDoctorMin<=51);assert.equal(after.overdue,false)
 const d2d=await doorToDoctor(db,nurse);assert.equal(d2d.overall.seen,1);assert.equal(d2d.byLevel.red.seen,1);assert.equal(d2d.byLevel.red.targetMin,0)
 await assignDoctor(db,rec,y.id,{doctorId:doc.userId})
 // identify the unknown patient
 const idp=await identify(db,nurse,u.id,{fullName:'Suresh Yadav',mobile:'9876500002',gender:'Male'});assert.equal(idp.full_name,'Suresh Yadav');await assert.rejects(identify(db,nurse,u.id,{fullName:'X'}),(e:any)=>e.status===409)
 const audits=(await db.query("select action from audit_log where entity='er_visit' and entity_id=$1 order by id",[u.id])).rows.map((r:any)=>r.action)
 for(const a of ['er_register','er_triage','er_retriage','er_seen','er_identify'])assert.ok(audits.includes(a),a)
})

test('ER disposition and MLC: intimation before leaving, admit to IPD, amend with trail, no delete, register + CSV', async()=>{
 const db=await freshDb();const t=await tenant(db,'Trauma Centre');const nurse=await t.mk('nurse','Sister MLC'),doc=await t.mk('doctor','Dr Trauma'),rec=await t.mk('reception','Front ER')
 const bed=await addBed(db,t.admin,{ward:'ICU',bedNo:'I1'})
 const v=await registerVisit(db,nurse,{unknown:true,gender:'Female',approxAge:25,arrivalMode:'police',broughtBy:'HC Sharma, PS Kotwali',chiefComplaint:'RTA, leg fracture',triageLevel:'orange'})
 await assert.rejects(markMlc(db,nurse,v.id,{mlcType:'rta'}),(e:any)=>e.status===403,'doctor declares MLC')
 await assert.rejects(markMlc(db,doc,v.id,{mlcType:'other'}),(e:any)=>e.status===400,'other needs detail')
 const m=await markMlc(db,doc,v.id,{mlcType:'rta',incidentPlace:'NH-44 near toll',identificationMarks:'Mole on left cheek; scar right forearm',injuries:[{site:'Right leg',type:'fracture',nature:'grievous'},{site:'Forehead',type:'abrasion',size:'3x2 cm',nature:'simple'}]})
 const y=new Date(Date.now()+330*60000).getUTCFullYear();assert.equal(m.mlc_no,`MLC/${y}/0001`);assert.equal(m.brought_by,'HC Sharma, PS Kotwali');assert.equal(m.injuries.length,2)
 await assert.rejects(markMlc(db,doc,v.id,{mlcType:'rta'}),(e:any)=>e.status===409)
 // disposition blocked until police are informed
 await assert.rejects(dispose(db,doc,v.id,{disposition:'admitted',bedId:bed.id}),(e:any)=>e.status===409&&e.extra?.code==='mlc_intimation_pending')
 await assert.rejects(dispose(db,nurse,v.id,{disposition:'discharged'}),(e:any)=>e.status===403)
 await assert.rejects(recordIntimation(db,nurse,m.id,{}),(e:any)=>e.status===400)
 const mi=await recordIntimation(db,nurse,m.id,{policeStation:'PS Kotwali',officerName:'SI Rakesh',officerBuckleNo:'1234'});assert.ok(mi.intimation_sent_at);assert.equal(mi.intimation_sent_by,nurse.userId)
 // amendments: filling blanks needs no reason; changing a recorded value does
 await amendMlc(db,nurse,m.id,{incidentAt:new Date(Date.now()-3600e3).toISOString()})
 await assert.rejects(amendMlc(db,nurse,m.id,{incidentPlace:'NH-48'}),(e:any)=>e.status===400)
 await assert.rejects(amendMlc(db,nurse,m.id,{mlcType:'assault',reason:'x'}),(e:any)=>e.status===403)
 const am=await amendMlc(db,doc,m.id,{incidentPlace:'NH-48 near toll',reason:'Police corrected the highway number'});assert.equal(am.incident_place,'NH-48 near toll')
 const full=await getMlc(db,doc,m.id);const tr=full.amendments.map((a:any)=>a.changes);assert.ok(tr.some((c:any)=>c.incident_place?.from==='NH-44 near toll'&&c.incident_place?.to==='NH-48 near toll'));assert.ok(tr.some((c:any)=>c.police_station?.to==='PS Kotwali'));assert.equal(full.mlc.intimation_by_name,'Sister MLC');assert.equal(full.hospital.name,'Trauma Centre')
 await assert.rejects(db.query('delete from mlc_cases where id=$1',[m.id]),/cannot be deleted/);await assert.rejects(db.query('delete from mlc_amendments where mlc_id=$1',[m.id]),/cannot be deleted/)
 // admit
 const d=await dispose(db,doc,v.id,{disposition:'admitted',bedId:bed.id});assert.equal(d.disposition,'admitted');assert.ok(d.admission_id);assert.ok(d.disposition_at)
 const adm=(await db.query('select * from admissions where id=$1',[d.admission_id])).rows[0];assert.equal(adm.patient_id,v.patient_id);assert.equal(adm.admitting_doctor_id,doc.userId,'defaults to the doctor who saw the patient');assert.equal(adm.reason,'RTA, leg fracture')
 await assert.rejects(dispose(db,doc,v.id,{disposition:'discharged'}),(e:any)=>e.status===409)
 assert.ok(!(await board(db,nurse)).visits.some((x:any)=>x.id===v.id))
 // other dispositions
 const a=await registerVisit(db,rec,{fullName:'Absconder One'});const ab=await dispose(db,nurse,a.id,{disposition:'absconded'});assert.equal(ab.disposition,'absconded')
 const l=await registerVisit(db,rec,{fullName:'Lama Patient'});await assert.rejects(dispose(db,doc,l.id,{disposition:'lama'}),(e:any)=>e.status===400);await dispose(db,doc,l.id,{disposition:'lama',note:'Son signed LAMA form'})
 const r=await registerVisit(db,rec,{fullName:'Referred Patient'});await assert.rejects(dispose(db,doc,r.id,{disposition:'referred'}),(e:any)=>e.status===400);await dispose(db,doc,r.id,{disposition:'referred',referredTo:'AIIMS Trauma'})
 // second MLC same year → 0002; poisoning
 const p2=await registerVisit(db,rec,{fullName:'Poison Case'});const m2=await markMlc(db,doc,p2.id,{mlcType:'poisoning',policeStation:'PS Sadar',intimationSentAt:new Date().toISOString()});assert.equal(m2.mlc_no,`MLC/${y}/0002`);assert.equal(m2.intimation_sent_by,doc.userId)
 // close / reopen
 await setMlcStatus(db,doc,m2.id,{status:'closed'});await assert.rejects(amendMlc(db,doc,m2.id,{notes:'x'}),(e:any)=>e.status===409);await assert.rejects(setMlcStatus(db,doc,m2.id,{status:'open',reason:'x'}),(e:any)=>e.status===403);await setMlcStatus(db,t.admin,m2.id,{status:'open',reason:'Court asked for a copy with corrections'})
 // register + csv
 const all=await mlcRegister(db,nurse);assert.equal(all.length,2);assert.equal((await mlcRegister(db,nurse,{type:'rta'})).length,1);assert.equal((await mlcRegister(db,nurse,{from:'2000-01-01',to:'2000-12-31'})).length,0)
 const csv=await mlcCsv(db,nurse,{type:'rta'});const lines=csv.trim().split('\r\n');assert.equal(lines.length,2);assert.match(lines[0],/^MLC no,/);assert.match(lines[1],/PS Kotwali/);assert.match(lines[1],/Right leg fracture grievous/)
 // tenant isolation
 const o=await tenant(db,'Other Hosp');await assert.rejects(getMlc(db,o.admin,m.id),(e:any)=>e.status===404);assert.equal((await mlcRegister(db,o.admin)).length,0)
})
