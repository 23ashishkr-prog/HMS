import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto'
import {freshDb,tenant} from './helpers'
import {registerPatient} from '../lib/services/patients'
import {addBed,admit,discharge} from '../lib/services/ipd'
import {createInvoice,invoiceTotals,addItem} from '../lib/services/billing'
import {requestClearance,clearanceView} from '../lib/services/clearance'
import {parseCsv,importPackages,listPackages,packageLines,setAdmissionScheme,applyPackage,removePackage,packageBill,createPreauth,updatePreauth,movePreauth,getPreauth,createSchemeClaim,updateSchemeClaim,schemeClaimPacket} from '../lib/services/pmjay'
import {eligibilityBundle,claimBundle,jweEncrypt,jweDecrypt,protocolHeaders,checkEligibility,sendPreauth,submitClaim,listMessages,getMessage,setTransport,saveSettings,settingsView} from '../lib/services/nhcx'
import {PDFDocument} from 'pdf-lib'
const CSV=`Package Code,Speciality,Package Name,Package Rate,Pre-auth Required,Implant,ALOS
SG039A,General Surgery,"Laparoscopic cholecystectomy",22800,Y,N,3
SG040B,General Surgery,"Hernia repair, open",15000,yes,Y,2
SB001A,Orthopaedics,Fracture fixation,10000,Y,Y,4
MG001A,General Medicine,"Acute febrile illness ""per day""",1800,N,N,
,Bad,No code,100,Y,N,1
XX9,Bad,Bad rate,abc,Y,N,1`
async function setup(){const db=await freshDb();const {admin,mk}=await tenant(db,'PMJAY Hosp');const rec=await mk('reception','R P'),doc=await mk('doctor','Dr Pm'),bill=await mk('billing','Bill P')
 const p=await registerPatient(db,rec,{fullName:'Ram Lal',mobile:'9876500661',gender:'Male',dateOfBirth:'1970-01-01'});const bed=await addBed(db,admin,{ward:'General',bedNo:'P1',dailyRate:1000})
 const a=await admit(db,rec,{patientId:p.id,doctorId:doc.userId,bedId:bed.id,reason:'Gall stones'});return {db,admin,mk,rec,doc,bill,p,a}}
test('pmjay: CSV parsing and package master import (upsert, errors, search)',async()=>{assert.deepEqual(parseCsv('a,"b ""c"", d"\r\n1,2\n'),[['a','b "c", d'],['1','2']])
 const {db,bill,doc}=await setup();const r=await importPackages(db,bill,CSV);assert.equal(r.inserted,4);assert.equal(r.updated,0);assert.equal(r.errors.length,2);assert.deepEqual(r.errors.map(e=>e.line),[6,7])
 const again=await importPackages(db,bill,'code,name,rate\nSG039A,Lap chole,23000');assert.equal(again.updated,1)
 const s=await listPackages(db,doc,'SG');assert.equal(s.length,2);const lc=s.find((x:any)=>x.code==='SG039A');assert.equal(Number(lc.rate),23000);assert.equal(lc.pre_auth_required,true)
 const m=(await listPackages(db,bill,'febrile'))[0];assert.equal(m.pre_auth_required,false);assert.equal(m.name,'Acute febrile illness "per day"')
 await assert.rejects(importPackages(db,doc,CSV),(e:any)=>e.status===403);await assert.rejects(importPackages(db,bill,'foo,bar\n1,2'),(e:any)=>e.status===400)})
test('pmjay: package math (HBP multiple-surgery rule 100/50/25, medical in full)',()=>{const x=packageLines([{code:'SG040B',rate:15000},{code:'SG039A',rate:22800},{code:'SB001A',rate:10000},{code:'MG001A',rate:1800,qty:3}])
 const by=Object.fromEntries(x.lines.map(l=>[l.code,l]));assert.equal(by.SG039A.pct,100);assert.equal(by.SG040B.pct,50);assert.equal(by.SB001A.pct,25);assert.equal(by.MG001A.pct,100);assert.equal(by.MG001A.amount,5400)
 assert.equal(x.total,22800+7500+2500+5400)})
test('pmjay: package billing makes the patient balance ₹0, keeps itemised record, discharge not held for payment',async()=>{const {db,admin,rec,doc,bill,p,a}=await setup();await importPackages(db,bill,CSV)
 const inv=await createInvoice(db,bill,{patientId:p.id,admissionId:a.id,items:[{description:'Bed 3 days',unitPrice:3000},{description:'LFT',unitPrice:800}]});assert.equal((await invoiceTotals(db,inv.id)).balance,3800)
 await assert.rejects(applyPackage(db,bill,a.id,{codes:['SG039A']}),(e:any)=>e.status===409&&/PM-JAY/.test(e.message))
 await assert.rejects(setAdmissionScheme(db,rec,a.id,{scheme:'PMJAY'}),(e:any)=>e.status===400)
 await setAdmissionScheme(db,rec,a.id,{scheme:'PMJAY',memberId:'PMJAY-UP-1234567'});const pt=(await db.query('select scheme,scheme_member_id from patients where id=$1',[p.id])).rows[0];assert.equal(pt.scheme,'PMJAY');assert.equal(pt.scheme_member_id,'PMJAY-UP-1234567')
 const r:any=await applyPackage(db,bill,a.id,{codes:['SG039A']});assert.match(r.warning,/Pre-authorisation is required for SG039A/)
 assert.equal(r.schemeAmount,22800);assert.equal(r.patient.balance,0);assert.equal(r.itemisedTotal>=3800,true);assert.equal(r.itemised.find((i:any)=>i.description==='LFT').recordPrice,800);assert.equal(r.itemised.find((i:any)=>i.description==='LFT').billed,0)
 assert.equal((await invoiceTotals(db,inv.id)).balance,0)
 // later charges on the stay are recorded at ₹0 too (trigger)
 await addItem(db,bill,inv.id,{description:'Dressing',unitPrice:500});const pb=await packageBill(db,bill,a.id);assert.equal(pb.patient.balance,0);assert.equal(pb.itemised.find((i:any)=>i.description==='Dressing')!.recordPrice,500)
 const inv2=await createInvoice(db,bill,{patientId:p.id,items:[{description:'Pharmacy',unitPrice:250}]});assert.equal((await db.query('select package_mode,admission_id from invoices where id=$1',[inv2.id])).rows[0].package_mode,true);assert.equal((await invoiceTotals(db,inv2.id)).balance,0)
 // clearance billing shows no dues → clearance can be issued and discharge goes through
 const v:any=await requestClearance(db,bill,p.id);assert.equal(v.departments.find((d:any)=>d.key==='billing').openItems,0)
 await db.query("update patient_clearances set status='cleared',clearance_no='CLR/P/1',cleared_at=now() where patient_id=$1 and status='open'",[p.id]);const d=await discharge(db,doc,a.id,{summary:'Lap chole done',diagnosis:'K80.2 Gall stones'});assert.equal(d.status,'discharged')
 // remove (restores prices) is refused after discharge
 await assert.rejects(removePackage(db,bill,a.id),(e:any)=>e.status===409)})
test('pmjay: removing the package restores itemised prices',async()=>{const {db,rec,bill,p,a}=await setup();await importPackages(db,bill,CSV);const inv=await createInvoice(db,bill,{patientId:p.id,admissionId:a.id,items:[{description:'Bed',unitPrice:2000}]})
 await setAdmissionScheme(db,rec,a.id,{scheme:'STATE',memberId:'ST-9'});const pb:any=await applyPackage(db,bill,a.id,{codes:['MG001A']});assert.equal((await invoiceTotals(db,inv.id)).balance,0);const rec0=pb.itemisedTotal;assert.ok(rec0>=2000)
 await assert.rejects(setAdmissionScheme(db,rec,a.id,{scheme:''}),(e:any)=>e.status===409);await removePackage(db,bill,a.id);assert.equal((await invoiceTotals(db,inv.id)).balance,rec0)
 await addItem(db,bill,inv.id,{description:'X',unitPrice:100});assert.equal((await invoiceTotals(db,inv.id)).balance,rec0+100)})
test('pmjay: pre-auth state machine, query/reply, enhancement, audit trail, claim',async()=>{const {db,rec,doc,bill,p,a}=await setup();await importPackages(db,bill,CSV);await setAdmissionScheme(db,rec,a.id,{scheme:'PMJAY',memberId:'PMJAY-UP-777'})
 await assert.rejects(createPreauth(db,bill,{patientId:p.id,admissionId:a.id,packages:['NOPE1']}),(e:any)=>e.status===404)
 const pr=await createPreauth(db,doc,{patientId:p.id,admissionId:a.id,packages:['SG039A'],diagnosis:'Cholelithiasis',documents:'https://x.test/usg.pdf\nnot-a-url'});assert.equal(pr.status,'draft');assert.equal(pr.member_id,'PMJAY-UP-777');assert.equal(Number(pr.requested_amount),22800);assert.equal(pr.documents.length,1)
 await assert.rejects(movePreauth(db,bill,pr.id,{status:'approved',approvedAmount:1}),(e:any)=>e.status===409)
 await assert.rejects(movePreauth(db,bill,pr.id,{status:'submitted'}),(e:any)=>e.status===400&&/clinical notes/.test(e.message))
 await updatePreauth(db,doc,pr.id,{clinicalNotes:'USG: multiple calculi, symptomatic 3 months'});await movePreauth(db,bill,pr.id,{status:'submitted'})
 await assert.rejects(updatePreauth(db,doc,pr.id,{diagnosis:'x'}),(e:any)=>e.status===409)
 await assert.rejects(movePreauth(db,bill,pr.id,{status:'queried'}),(e:any)=>e.status===400);await movePreauth(db,bill,pr.id,{status:'queried',query:'Attach LFT report'})
 await updatePreauth(db,doc,pr.id,{documents:['https://x.test/usg.pdf','https://x.test/lft.pdf']});await assert.rejects(movePreauth(db,bill,pr.id,{status:'submitted'}),(e:any)=>e.status===400&&/Reply/.test(e.message))
 await movePreauth(db,bill,pr.id,{status:'submitted',reply:'LFT attached'});await assert.rejects(movePreauth(db,bill,pr.id,{status:'approved',approvedAmount:99999}),(e:any)=>e.status===400)
 await assert.rejects(createSchemeClaim(db,bill,pr.id),(e:any)=>e.status===409)
 await movePreauth(db,bill,pr.id,{status:'approved',approvedAmount:22800,payerRef:'PA/2026/0001'});await assert.rejects(movePreauth(db,bill,pr.id,{status:'rejected',note:'x'}),(e:any)=>e.status===409)
 const g:any=await getPreauth(db,bill,pr.id);assert.deepEqual(g.events.map((e:any)=>e.to_status),['draft','submitted','queried','submitted','approved']);assert.equal(g.preauth.query_text,'Attach LFT report');assert.equal(g.preauth.query_reply,'LFT attached');assert.equal(g.next.length,0)
 assert.ok(Number((await db.query("select count(*) from audit_log where entity='preauth' and entity_id=$1",[pr.id])).rows[0].count)>=5)
 // enhancement: needs approved parent; inherits patient/admission/member
 const draft2=await createPreauth(db,bill,{patientId:p.id,packages:['MG001A'],memberId:'M'});await assert.rejects(createPreauth(db,bill,{kind:'enhancement',parentId:draft2.id,packages:['MG001A']}),(e:any)=>e.status===409)
 const en=await createPreauth(db,bill,{kind:'enhancement',parentId:pr.id,packages:[{code:'MG001A',qty:2}],clinicalNotes:'Post-op fever'});assert.equal(en.admission_id,a.id);assert.equal(Number(en.requested_amount),3600)
 await movePreauth(db,bill,en.id,{status:'submitted'});await movePreauth(db,bill,en.id,{status:'approved',approvedAmount:3000})
 await assert.rejects(createSchemeClaim(db,bill,en.id),(e:any)=>e.status===409)
 // package from approved pre-auths (initial + enhancement)
 const pb:any=await applyPackage(db,bill,a.id);assert.equal(pb.warning,null);assert.equal(pb.schemeAmount,22800+3600);assert.equal(pb.preauthApproved,25800)
 const c=await createSchemeClaim(db,bill,pr.id);assert.equal(c.status,'preauth_approved');assert.equal(Number(c.claimed_amount),25800);assert.equal(c.scheme,'PMJAY');await assert.rejects(createSchemeClaim(db,bill,pr.id),(e:any)=>e.status===409)
 await updateSchemeClaim(db,bill,c.id,{status:'claim_submitted'});const s=await updateSchemeClaim(db,bill,c.id,{status:'settled',approvedAmount:25000,settlementRef:'UTR123'});assert.ok(s.submitted_at);assert.ok(s.settled_at);assert.equal(Number(s.deduction_amount),800);assert.equal(s.settlement_ref,'UTR123')
 const pk=await schemeClaimPacket(db,bill,c.id);const pdf=await PDFDocument.load(pk.bytes);assert.ok(pdf.getPageCount()>=2)
 const o=await tenant(db,'PMJ Other');const ob=await o.mk('billing','B O');await assert.rejects(getPreauth(db,ob,pr.id),(e:any)=>e.status===404)})
const ok=(b:any,id:string)=>b.entry.some((e:any)=>e.fullUrl===id)
test('nhcx: FHIR bundle shape (eligibility, preauth, claim) with resolvable references',()=>{const inp:any={hospital:{name:'H',participantCode:'1000@hcx'},payer:{name:'NHA',participantCode:'2000@hcx'},patient:{id:'p',uhid:'U1',name:'Ram',gender:'Male',birthDate:'1970-01-01',abha:'91-1111-2222-3333'},coverage:{scheme:'PMJAY',memberId:'PM1'},practitioner:{name:'Dr A',regNo:'R1'},diagnoses:[{code:'K80.2',text:'Gall stones'}],
  items:packageLines([{code:'SG039A',name:'Lap chole',rate:22800},{code:'SG040B',name:'Hernia',rate:15000}]).lines,documents:[{url:'https://x.test/a.pdf'}],notes:'notes',admittedAt:new Date().toISOString(),preauthRef:'PA1'}
 const e:any=eligibilityBundle(inp);assert.equal(e.resourceType,'Bundle');assert.equal(e.type,'collection');assert.match(e.meta.profile[0],/CoverageEligibilityRequestBundle$/);assert.equal(e.entry[0].resource.resourceType,'CoverageEligibilityRequest');assert.ok(e.timestamp&&e.identifier.value)
 const cer=e.entry[0].resource;for(const r of [cer.patient,cer.provider,cer.insurer,cer.insurance[0].coverage])assert.ok(ok(e,r.reference),r.reference);assert.deepEqual(cer.purpose,['validation','benefits'])
 for(const use of ['preauthorization','claim'] as const){const b:any=claimBundle(inp,use);assert.match(b.meta.profile[0],/ClaimBundle$/);const c=b.entry[0].resource;assert.equal(c.resourceType,'Claim');assert.equal(c.use,use);assert.equal(c.status,'active');assert.equal(c.type.coding[0].code,'institutional')
  assert.equal(c.total.value,22800+7500);assert.equal(c.total.currency,'INR');assert.equal(c.item.length,2);assert.equal(c.item[1].factor,0.5);assert.equal(c.item[0].productOrService.coding[0].code,'SG039A')
  for(const r of [c.patient,c.provider,c.insurer,c.insurance[0].coverage,c.careTeam[0].provider,c.diagnosis[0].diagnosisReference])assert.ok(ok(b,r.reference),r.reference)
  const pat=b.entry.find((x:any)=>x.resource.resourceType==='Patient').resource;assert.equal(pat.gender,'male');assert.ok(pat.identifier.some((i:any)=>i.value==='91-1111-2222-3333'));assert.ok(c.supportingInfo.some((s:any)=>s.valueAttachment?.url==='https://x.test/a.pdf'))
  assert.equal(!!c.preAuthRef,use==='claim');for(const x of b.entry)assert.ok(x.resource.meta.profile[0].startsWith('https://nrces.in/ndhm/fhir/r4/StructureDefinition/'))}})
test('nhcx: JWE round trip with protocol headers',()=>{const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
 const h=protocolHeaders({sender:'a@hcx',recipient:'b@hcx',correlationId:'c1',apiCallId:'k1'});const jwe=jweEncrypt({hello:'नमस्ते'},publicKey,h);assert.equal(jwe.split('.').length,5)
 const d=jweDecrypt(jwe,privateKey);assert.equal(d.payload.hello,'नमस्ते');assert.equal(d.header['x-hcx-recipient_code'],'b@hcx');assert.equal(d.header.alg,'RSA-OAEP-256');assert.equal(d.header.enc,'A256GCM')
 const bad=jwe.split('.');bad[3]=Buffer.from('tampered').toString('base64url');assert.throws(()=>jweDecrypt(bad.join('.'),privateKey))})
test('nhcx: offline mode stores bundles; live mode sends JWE via the transport',async()=>{const {db,admin,rec,bill,p,a}=await setup();await importPackages(db,bill,CSV);await setAdmissionScheme(db,rec,a.id,{scheme:'PMJAY',memberId:'PMJAY-1'})
 const el:any=await checkEligibility(db,bill,a.id);assert.equal(el.mode,'offline');assert.equal(el.status,'generated');assert.match(el.note,/registered on the NHCX gateway/);const m=await getMessage(db,bill,el.id);assert.equal(m.request.entry[0].resource.resourceType,'CoverageEligibilityRequest')
 const pr=await createPreauth(db,bill,{patientId:p.id,admissionId:a.id,packages:['SG039A'],clinicalNotes:'n'});const sp:any=await sendPreauth(db,bill,pr.id);assert.equal(sp.bundle.entry[0].resource.use,'preauthorization');assert.equal((await getPreauth(db,bill,pr.id)).preauth.status,'submitted')
 await movePreauth(db,bill,pr.id,{status:'approved',approvedAmount:22800});const c=await createSchemeClaim(db,bill,pr.id);const sc:any=await submitClaim(db,bill,c.id);assert.equal(sc.bundle.entry[0].resource.use,'claim');assert.equal((await db.query('select status from insurance_claims where id=$1',[c.id])).rows[0].status,'claim_submitted')
 assert.equal((await listMessages(db,bill)).length,3);assert.equal((await settingsView(db,bill)).mode,'offline')
 // live: configure credentials, fake transport, payer decrypts what we sent
 process.env.INTEGRATIONS_ENC_KEY=process.env.INTEGRATIONS_ENC_KEY||'test-key-for-nhcx';const payer=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});const ours=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}})
 await assert.rejects(saveSettings(db,bill,{}),(e:any)=>e.status===403);await assert.rejects(saveSettings(db,admin,{privateKey:'nope'}),(e:any)=>e.status===400)
 const v=await saveSettings(db,admin,{participantCode:'1001@hcx',username:'hosp',secret:'s3cret',privateKey:ours.privateKey,gatewayUrl:'https://nhcx.example.test',defaultPayerCode:'2002@hcx'});assert.equal(v.mode,'live');assert.ok(!JSON.stringify(v).includes('s3cret'))
 const sent:any[]=[];const prev=setTransport({recipientCert:async(_c,code)=>{assert.equal(code,'2002@hcx');return payer.publicKey},send:async(_c,action,jwe)=>{sent.push({action,jwe});return {status:202,body:{api_call_id:'x'}}}})
 try{const r:any=await checkEligibility(db,bill,a.id);assert.equal(r.mode,'live');assert.equal(r.status,'acknowledged');assert.equal(sent[0].action,'/coverageeligibility/check');const d=jweDecrypt(sent[0].jwe,payer.privateKey);assert.equal(d.header['x-hcx-sender_code'],'1001@hcx');assert.equal(d.header['x-hcx-correlation_id'],r.correlationId);assert.equal(d.payload.resourceType,'Bundle')
  setTransport({recipientCert:async()=>payer.publicKey,send:async()=>({status:401,body:{error:{message:'bad token'}}})});const f:any=await checkEligibility(db,bill,a.id);assert.equal(f.status,'failed');assert.match(f.error,/bad token/)}finally{setTransport(prev)}})
