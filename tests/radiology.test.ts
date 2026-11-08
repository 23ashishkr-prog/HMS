import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addCatalogItem,orderTest,advanceOrder} from '../lib/services/diagnostics'
import {radiologyWorklist,getStudy,radiologyAction,pacsSettings} from '../lib/services/radiology'
import {patientRecord} from '../lib/services/record'
import {inferModality,viewerUrl,safetyIssues,uidFromUuid,isDicomUid,formatAccession} from '../lib/radiology'
const rej=(s:number)=>(e:any)=>e.status===s
test('pure helpers: modality guess, viewer link, safety rules, DICOM UIDs',()=>{
 assert.equal(inferModality('CT Brain plain'),'ct');assert.equal(inferModality('MRI L-S spine'),'mri');assert.equal(inferModality('USG whole abdomen'),'usg');assert.equal(inferModality('2D Echo'),'cardio');assert.equal(inferModality('Mammography bilateral'),'mammo');assert.equal(inferModality('DEXA scan'),'dexa');assert.equal(inferModality('Barium swallow'),'fluoro');assert.equal(inferModality('Chest PA view'),'xray')
 assert.equal(viewerUrl('https://p.example/viewer?StudyInstanceUIDs={studyUid}&accession={accession}',{studyUid:'1.2.3',accession:'R1 2'}),'https://p.example/viewer?StudyInstanceUIDs=1.2.3&accession=R1%202')
 assert.equal(viewerUrl('https://p.example/v?s={studyUid}',{accession:'A'}),null,'missing value → no link');assert.equal(viewerUrl('javascript:alert(1)//{studyUid}',{studyUid:'1.2'}),null);assert.equal(viewerUrl('',{studyUid:'1.2'}),null)
 assert.deepEqual(safetyIssues({modality:'usg'},'Female'),[]);assert.deepEqual(safetyIssues({modality:'xray',pregnancy_status:'unknown'},'Male'),[])
 assert.ok(safetyIssues({modality:'xray',pregnancy_status:'unknown'},'Female').some(s=>/Pregnancy/.test(s)))
 assert.deepEqual(safetyIssues({modality:'ct',contrast:true,allergy_status:'none',creatinine:0.9,pregnancy_status:'not_pregnant'},'Female'),[])
 assert.ok(safetyIssues({modality:'ct',contrast:true,allergy_status:'none',creatinine:2.1},'Male').some(s=>/Creatinine 2.1/.test(s)))
 assert.equal(safetyIssues({modality:'ct',contrast:true},'Male').length,2)
 const u=uidFromUuid('123e4567-e89b-12d3-a456-426614174000');assert.ok(u.startsWith('2.25.')&&isDicomUid(u)&&u.length<=64);assert.ok(!isDicomUid('1.02.3'));assert.ok(!isDicomUid('abc'))
 assert.equal(formatAccession('261108',7),'R2611080007')})
test('radiology: schedule → safety → acquire → report (critical alerts doctor) → verify → result in record',async()=>{const db=await freshDb();const {admin,mk}=await tenant(db,'Rad Hosp');const rec=await mk('reception','Rec R'),doc=await mk('doctor','Dr Order'),rad=await mk('doctor','Dr Rad'),tech=await mk('lab','Tech R'),nurse=await mk('nurse','Nurse R')
 await db.query("update users set phone='9876500771',email='drorder@radhosp.in' where id=$1",[doc.userId]);await db.query("update users set designation='Consultant Radiologist' where id=$1",[rad.userId])
 const ct=await addCatalogItem(db,admin,{code:'CTB',name:'CT Brain contrast',category:'radiology',price:3000});const p=await registerPatient(db,rec,{fullName:'Scan Pt',mobile:'9876500772',gender:'Female'})
 const o=await orderTest(db,doc,{patientId:p.id,serviceId:ct.id,priority:'urgent'})
 let wl=await radiologyWorklist(db,tech,{status:'new'});assert.equal(wl.length,1);assert.equal(wl[0].modality,'ct');assert.equal(wl[0].study_status,'new')
 assert.equal((await radiologyWorklist(db,tech,{status:'new',modality:'mri'})).length,0);await assert.rejects(radiologyWorklist(db,rec,{}),rej(403));await assert.rejects(radiologyWorklist(db,tech,{status:'bogus'}),rej(400))
 // schedule with contrast: creatinine high and pregnancy unknown → acquire blocked
 let s=await radiologyAction(db,tech,o.id,{action:'schedule',bodyPart:'Brain',scheduledAt:'2026-11-09T10:30:00+05:30',room:'CT-1',contrast:true,contrastAgent:'Iohexol',allergyStatus:'none',creatinine:'2.2'})
 assert.equal(s.study_status,'scheduled');assert.match(s.accession_no,/^R\d{10}$/);assert.ok(s.issues.length>=2);assert.equal((await radiologyWorklist(db,tech,{status:'scheduled',modality:'ct'})).length,1)
 await assert.rejects(radiologyAction(db,tech,o.id,{action:'acquire'}),(e:any)=>e.status===409&&/Safety check/.test(e.message))
 await assert.rejects(radiologyAction(db,tech,o.id,{action:'schedule',overrideReason:'urgent stroke'}),rej(403),'technician cannot override')
 await assert.rejects(radiologyAction(db,tech,o.id,{action:'schedule',creatinine:'abc'}),rej(400))
 s=await radiologyAction(db,tech,o.id,{action:'schedule',creatinine:'1.1',pregnancyStatus:'not_pregnant'});assert.deepEqual(s.issues,[])
 // quick result from the Lab page is refused once the study is on the radiology worklist
 await assert.rejects(advanceOrder(db,tech,o.id,{action:'result',resultText:'x'}),rej(409))
 await assert.rejects(radiologyAction(db,rad,o.id,{action:'report',findings:'f',impression:'i'}),rej(409),'report before images')
 await assert.rejects(radiologyAction(db,tech,o.id,{action:'acquire',studyInstanceUid:'1.2.abc'}),rej(400));await assert.rejects(radiologyAction(db,tech,o.id,{action:'acquire',accession:'this-is-way-too-long-1'}),rej(400))
 await assert.rejects(radiologyAction(db,nurse,o.id,{action:'acquire'}),rej(403))
 s=await radiologyAction(db,tech,o.id,{action:'acquire',studyInstanceUid:'1.2.840.113619.2.55.3.1'});assert.equal(s.study_status,'acquired');assert.equal(s.study_instance_uid,'1.2.840.113619.2.55.3.1');assert.equal(s.technician_name,'Tech R')
 assert.equal(s.viewer_url,null,'no PACS template yet')
 await assert.rejects(radiologyAction(db,tech,o.id,{action:'report',findings:'f',impression:'i'}),rej(403),'technician cannot report')
 await assert.rejects(radiologyAction(db,rad,o.id,{action:'report',findings:'',impression:'i'}),rej(400))
 const r1:any=await radiologyAction(db,rad,o.id,{action:'report',technique:'Axial CT with contrast',findings:'Large acute right MCA territory infarct with mass effect.',impression:'Acute right MCA infarct.',critical:true})
 assert.equal(r1.study_status,'reported');assert.equal(r1.radiologist_name,'Dr Rad');assert.equal(r1.notified.queued,2)
 const out=(await db.query("select channel,to_address,patient_id,body from notification_outbox where kind='critical_result' order by channel")).rows;assert.deepEqual(out.map((x:any)=>x.to_address),['drorder@radhosp.in','9876500771']);assert.equal(out[0].patient_id,null);assert.match(out[0].body,/CRITICAL[\s\S]*Scan Pt/)
 const r2:any=await radiologyAction(db,rad,o.id,{action:'report',findings:'Large acute right MCA territory infarct.',impression:'Acute right MCA infarct.',critical:true});assert.equal(r2.notified,null,'edit does not re-alert')
 assert.equal((await db.query("select count(*)::int n from notification_outbox where kind='critical_result'")).rows[0].n,2)
 // critical studies come first on the worklist; doctor sees it in the record before verification
 wl=await radiologyWorklist(db,doc,{});assert.equal(wl[0].order_id,o.id);assert.equal(wl[0].critical,true)
 s=await radiologyAction(db,rad,o.id,{action:'verify'});assert.equal(s.study_status,'verified');assert.equal(s.verified_by_name,'Dr Rad')
 await assert.rejects(radiologyAction(db,rad,o.id,{action:'verify'}),rej(409));await assert.rejects(radiologyAction(db,rad,o.id,{action:'report',findings:'x',impression:'y'}),rej(409))
 const ord=(await db.query('select status,result_text,resulted_by from diagnostic_orders where id=$1',[o.id])).rows[0];assert.equal(ord.status,'completed');assert.match(ord.result_text,/^CRITICAL: Acute right MCA infarct/);assert.equal(ord.resulted_by,rad.userId)
 // ordering doctor acknowledges
 await assert.rejects(radiologyAction(db,tech,o.id,{action:'ack'}),rej(403));s=await radiologyAction(db,doc,o.id,{action:'ack'});assert.equal(s.critical_ack_name,'Dr Order');await assert.rejects(radiologyAction(db,doc,o.id,{action:'ack'}),rej(409))
 // PACS template → viewer link in study, worklist and patient record
 await assert.rejects(pacsSettings(db,tech,{viewerUrl:'https://x/{studyUid}'}),rej(403));await assert.rejects(pacsSettings(db,admin,{viewerUrl:'ftp://x/{studyUid}'}),rej(400));await assert.rejects(pacsSettings(db,admin,{viewerUrl:'https://pacs.example/viewer'}),rej(400))
 const ps=await pacsSettings(db,admin,{viewerUrl:'https://pacs.example/viewer?StudyInstanceUIDs={studyUid}&accession={accession}',dicomwebUrl:'https://pacs.example/dicom-web'});assert.match(ps.preview!,/StudyInstanceUIDs=1\.2\.840/);assert.equal((await pacsSettings(db,doc)).dicomwebUrl,'https://pacs.example/dicom-web')
 const g=await getStudy(db,doc,o.id);assert.equal(g.study.viewer_url,`https://pacs.example/viewer?StudyInstanceUIDs=1.2.840.113619.2.55.3.1&accession=${g.study.accession_no}`);assert.equal(g.hospital.name,'Rad Hosp')
 const rec2:any=await patientRecord(db,doc,p.id);const lab=rec2.labs.find((x:any)=>x.id===o.id);assert.equal(lab.study_status,'verified');assert.equal(lab.viewer_url,g.study.viewer_url);assert.equal(lab.pacs_tpl,undefined);assert.match(lab.result_text,/MCA/)
 assert.ok(rec2.timeline.some((e:any)=>e.kind==='lab'&&/MCA/.test(e.detail)))})
test('radiology: accession numbers unique and sequential; duplicate UID refused; tenant isolation; no contrast needs no check',async()=>{const db=await freshDb();const {admin,mk}=await tenant(db,'Rad Two');const rec=await mk('reception','Rec 2'),doc=await mk('doctor','Dr Two'),tech=await mk('lab','Tech 2')
 const xr=await addCatalogItem(db,admin,{code:'CXR',name:'X-ray Chest PA',category:'radiology',price:300});const p=await registerPatient(db,rec,{fullName:'Male Pt',mobile:'9876500781',gender:'Male'})
 const a=await orderTest(db,doc,{patientId:p.id,serviceId:xr.id}),b=await orderTest(db,doc,{patientId:p.id,serviceId:xr.id}),c=await orderTest(db,doc,{patientId:p.id,serviceId:xr.id})
 const sa=await radiologyAction(db,tech,a.id,{action:'acquire',studyInstanceUid:'1.2.3.4'});const sb=await radiologyAction(db,tech,b.id,{action:'schedule'})
 assert.notEqual(sa.accession_no,sb.accession_no);assert.equal(Number(sb.accession_no.slice(-4)),Number(sa.accession_no.slice(-4))+1);assert.match(sa.study_instance_uid,/^1\.2\.3\.4$/)
 await assert.rejects(radiologyAction(db,tech,b.id,{action:'acquire',studyInstanceUid:'1.2.3.4'}),(e:any)=>e.status===409&&/UID/.test(e.message))
 await assert.rejects(radiologyAction(db,tech,b.id,{action:'acquire',accession:sa.accession_no}),(e:any)=>e.status===409&&/accession/.test(e.message))
 const sb2=await radiologyAction(db,tech,b.id,{action:'acquire'});assert.ok(sb2.study_instance_uid.startsWith('2.25.'))
 await advanceOrder(db,tech,c.id,{action:'cancel'});assert.ok(!(await radiologyWorklist(db,tech,{})).some((x:any)=>x.order_id===c.id),'cancelled orders are hidden');await assert.rejects(radiologyAction(db,tech,c.id,{action:'schedule'}),rej(409))
 await assert.rejects(radiologyAction(db,tech,a.id,{action:'bogus'}),rej(400))
 const o2=await tenant(db,'Rad Other');const t2=await o2.mk('lab','Tech O');await assert.rejects(getStudy(db,t2,a.id),rej(404));await assert.rejects(radiologyAction(db,t2,a.id,{action:'schedule'}),rej(404));assert.equal((await radiologyWorklist(db,t2,{})).length,0)})
