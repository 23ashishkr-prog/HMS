import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addBed,admit} from '../lib/services/ipd'
import {addLeave} from '../lib/services/doctorsched'
import {unbilledCharges,autoBill} from '../lib/services/flows'
import {addRoom,setRoomActive,otBoard,scheduleSurgery,updateSurgery,cancelSurgery,saveChecklist,startSurgery,saveOpNote,completeSurgery,getSurgery} from '../lib/services/ot'
import {WHO} from '../lib/otChecklist'
const full=(ph:'sign_in'|'time_out'|'sign_out')=>Object.fromEntries(WHO[ph].map(i=>[i.key,i.kind==='check'?true:i.options![0][0]]))
const DAY='2027-03-15'

test('OT: schedule with clash checks, WHO checklist gates, operative note, completion bills the procedure', async()=>{
 const db=await freshDb();const t=await tenant(db,'OT Hospital');const rec=await t.mk('reception','Desk'),surg=await t.mk('doctor','Dr Cut'),anae=await t.mk('doctor','Dr Gas'),doc2=await t.mk('doctor','Dr Two'),nurse=await t.mk('nurse','Sister OT'),bill=await t.mk('billing','Biller')
 const room=await addRoom(db,t.admin,{name:'OT 1'}),room2=await addRoom(db,t.admin,{name:'OT 2'})
 await assert.rejects(addRoom(db,t.admin,{name:'OT 1'}),(e:any)=>e.status===409);await assert.rejects(addRoom(db,surg,{name:'OT 9'}),(e:any)=>e.status===403)
 const svc=(await db.query("insert into service_catalog(hospital_id,code,name,category,price) values($1,'LAPCHOLE','Laparoscopic cholecystectomy','procedure',45000) returning id",[t.admin.hospitalId])).rows[0]
 const lab=(await db.query("insert into service_catalog(hospital_id,code,name,category,price) values($1,'CBCX','CBC','lab',300) returning id",[t.admin.hospitalId])).rows[0]
 const bed=await addBed(db,t.admin,{ward:'Surgical',bedNo:'S1'});const p=await registerPatient(db,rec,{fullName:'Gall Stone',mobile:'9876501111'});const a=await admit(db,rec,{patientId:p.id,doctorId:surg.userId,bedId:bed.id})
 const p2=await registerPatient(db,rec,{fullName:'Hernia Case',mobile:'9876502222'})
 const base={patientId:p.id,roomId:room.id,surgeonId:surg.userId,anaesthetistId:anae.userId,assistantIds:[nurse.userId],date:DAY,startTime:'09:00',durationMin:90,serviceId:svc.id,anaesthesiaType:'general'}
 await assert.rejects(scheduleSurgery(db,nurse,base),(e:any)=>e.status===403,'nurses do not book cases')
 await assert.rejects(scheduleSurgery(db,surg,{...base,serviceId:lab.id}),(e:any)=>e.status===404,'only procedure services')
 await assert.rejects(scheduleSurgery(db,surg,{...base,assistantIds:[surg.userId]}),(e:any)=>e.status===400,'same person twice')
 await assert.rejects(scheduleSurgery(db,surg,{...base,date:'2020-01-01'}),(e:any)=>e.status===400,'past')
 const s=await scheduleSurgery(db,surg,base)
 assert.equal(s.admission_id,a.id,'links the open admission');assert.equal(s.procedure_name,'Laparoscopic cholecystectomy');assert.equal(new Date(s.scheduled_start).toISOString(),'2027-03-15T03:30:00.000Z')
 // Clashes: room, patient, surgeon/anaesthetist/assistant busy, on leave
 const other={patientId:p2.id,roomId:room.id,surgeonId:doc2.userId,date:DAY,startTime:'10:00',durationMin:60,procedureName:'Hernia repair'}
 await assert.rejects(scheduleSurgery(db,doc2,other),(e:any)=>e.status===409&&/OT 1 is booked 09:00–10:30/.test(e.message),'room double-booked')
 await assert.rejects(scheduleSurgery(db,doc2,{...other,roomId:room2.id,patientId:p.id}),(e:any)=>e.status===409&&/patient already has/.test(e.message),'patient in two places')
 await assert.rejects(scheduleSurgery(db,doc2,{...other,roomId:room2.id,surgeonId:surg.userId}),(e:any)=>e.status===409&&/Dr Cut is in another case/.test(e.message),'surgeon busy')
 await assert.rejects(scheduleSurgery(db,doc2,{...other,roomId:room2.id,anaesthetistId:anae.userId}),(e:any)=>e.status===409&&/Dr Gas/.test(e.message),'anaesthetist busy')
 await assert.rejects(scheduleSurgery(db,doc2,{...other,roomId:room2.id,assistantIds:[nurse.userId]}),(e:any)=>e.status===409&&/Sister OT/.test(e.message),'assistant busy')
 const back=await scheduleSurgery(db,doc2,{...other,startTime:'10:30'});assert.ok(back.id,'back-to-back in the same room is fine')
 await addLeave(db,t.admin,doc2.userId,{startDate:'2027-03-16',reason:'Conference'})
 await assert.rejects(scheduleSurgery(db,doc2,{...other,date:'2027-03-16'}),(e:any)=>e.status===409&&/on leave \(Conference\)/.test(e.message)&&e.extra?.code==='ot_clash','surgeon on leave')
 await assert.rejects(updateSurgery(db,doc2,back.id,{date:'2027-03-16'}),(e:any)=>e.status===409,'cannot move onto leave')
 const moved=await updateSurgery(db,doc2,back.id,{roomId:room2.id,startTime:'09:00'});assert.equal(moved.room_id,room2.id)
 await assert.rejects(updateSurgery(db,surg,s.id,{roomId:room2.id}),(e:any)=>e.status===409,'room 2 is now taken at 09:00')
 // Board
 let b=await otBoard(db,nurse,DAY);assert.equal(b.rooms.length,2);assert.equal(b.counts.total,2);assert.equal(b.services.length,1);assert.ok(b.doctors.length>=3)
 // Checklist gates
 await assert.rejects(startSurgery(db,nurse,s.id),(e:any)=>e.status===409&&e.extra?.code==='checklist_pending')
 await assert.rejects(saveChecklist(db,nurse,s.id,'time_out',full('time_out')),(e:any)=>e.status===409&&/sign in first/.test(e.message))
 await assert.rejects(saveChecklist(db,nurse,s.id,'sign_out',full('sign_out')),(e:any)=>e.status===409,'sign out only after start')
 const part=await saveChecklist(db,nurse,s.id,'sign_in',{identity:true,allergy:'maybe'});assert.equal(part.complete,false);assert.ok(part.missing.length===WHO.sign_in.length-1,'invalid answer not kept')
 await assert.rejects(saveChecklist(db,nurse,s.id,'time_out',full('time_out')),(e:any)=>e.status===409,'sign in still incomplete')
 assert.equal((await saveChecklist(db,nurse,s.id,'sign_in',{...full('sign_in'),note:'Allergy: none'})).complete,true)
 await assert.rejects(saveChecklist(db,nurse,s.id,'sign_in',full('sign_in')),(e:any)=>e.status===409,'signed phase is locked')
 await assert.rejects(startSurgery(db,surg,s.id),(e:any)=>e.status===409&&/time out/.test(e.message))
 await saveChecklist(db,surg,s.id,'time_out',full('time_out'))
 await assert.rejects(completeSurgery(db,surg,s.id),(e:any)=>e.status===409&&/Start the surgery/.test(e.message))
 const st=await startSurgery(db,nurse,s.id);assert.equal(st.status,'in_progress');assert.ok(st.actual_start)
 await assert.rejects(cancelSurgery(db,surg,s.id,{reason:'x'}),(e:any)=>e.status===409,'cannot cancel once started')
 await assert.rejects(completeSurgery(db,surg,s.id),(e:any)=>e.status===409&&/sign out/.test(e.message)&&/operative note/.test(e.message))
 await saveChecklist(db,nurse,s.id,'sign_out',full('sign_out'))
 await assert.rejects(saveOpNote(db,nurse,s.id,{procedureDetails:'x'}),(e:any)=>e.status===403,'nurses do not write the op note')
 await saveOpNote(db,surg,s.id,{preOpDiagnosis:'Cholelithiasis',findings:'Distended GB, multiple calculi',bloodLossMl:50,implants:[{name:'Hem-o-lok clip',size:'ML',lot:'L123',qty:3},{name:''}]})
 await assert.rejects(completeSurgery(db,surg,s.id),(e:any)=>e.status===409&&/post-op diagnosis/.test(e.message)&&!/sign out/.test(e.message))
 const n=await saveOpNote(db,surg,s.id,{postOpDiagnosis:'Chronic calculous cholecystitis',procedureDetails:'4-port lap chole; cystic duct and artery clipped and divided.',postOpInstructions:'NPO 6 h, then sips'})
 assert.equal(n.pre_op_diagnosis,'Cholelithiasis','partial save keeps earlier fields');assert.equal(n.implants.length,1);assert.equal(n.blood_loss_ml,50)
 // Nothing pending before completion
 assert.ok(!(await unbilledCharges(db,bill,p.id)).some((c:any)=>c.sourceType==='surgery'))
 const done=await completeSurgery(db,surg,s.id);assert.equal(done.status,'completed');assert.deepEqual(done.charge,{description:'Laparoscopic cholecystectomy',unitPrice:45000})
 await assert.rejects(saveOpNote(db,surg,s.id,{findings:'late edit'}),(e:any)=>e.status===409,'note locked after completion')
 const pend=(await unbilledCharges(db,bill,p.id)).filter((c:any)=>c.sourceType==='surgery');assert.equal(pend.length,1);assert.equal(pend[0].unitPrice,45000);assert.equal(pend[0].sourceId,s.id)
 const inv=await autoBill(db,bill,p.id,'surgery');assert.equal(inv.gross,45000)
 assert.equal((await unbilledCharges(db,bill,p.id)).filter((c:any)=>c.sourceType==='surgery').length,0,'billed once')
 // Detail / print data
 const g=await getSurgery(db,nurse,s.id);assert.equal(g.surgery.checklist.sign_in.by,'Sister OT');assert.equal(g.surgery.checklist.time_out.by,'Dr Cut');assert.equal(g.surgery.checklist.sign_in.answers.note,'Allergy: none');assert.deepEqual(g.surgery.assistants,['Sister OT']);assert.equal(g.surgery.room,'OT 1');assert.equal(g.hospital.name,'OT Hospital')
 // Cancel frees the slot
 await assert.rejects(cancelSurgery(db,doc2,back.id,{}),(e:any)=>e.status===400,'reason required')
 await cancelSurgery(db,doc2,back.id,{reason:'Patient unfit'});const again=await scheduleSurgery(db,doc2,{...other,roomId:room2.id,startTime:'09:00'});assert.ok(again.id)
 b=await otBoard(db,surg,DAY);assert.equal(b.counts.completed,1);assert.equal(b.surgeries.find((x:any)=>x.id===s.id)!.checks,3)
 // Inactive room cannot be booked
 await setRoomActive(db,t.admin,room2.id,false);await assert.rejects(scheduleSurgery(db,doc2,{...other,roomId:room2.id,startTime:'14:00'}),(e:any)=>e.status===404)
 // Audit trail
 const acts=(await db.query("select action from audit_log where hospital_id=$1 and entity='surgery' and entity_id=$2 order by id",[t.admin.hospitalId,s.id])).rows.map((r:any)=>r.action)
 assert.deepEqual(acts,['ot.schedule','ot.checklist_saved','ot.checklist_signed','ot.checklist_signed','ot.start','ot.checklist_signed','ot.note','ot.note','ot.complete'])
 // Tenant isolation
 const o=await tenant(db,'Other OT');await assert.rejects(getSurgery(db,o.admin,s.id),(e:any)=>e.status===404);await assert.rejects(startSurgery(db,o.admin,s.id),(e:any)=>e.status===404)
 assert.equal((await otBoard(db,o.admin,DAY)).surgeries.length,0)
})
