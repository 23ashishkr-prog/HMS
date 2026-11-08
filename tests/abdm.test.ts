import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto'
import {freshDb,tenant} from './helpers';import {Db} from '../lib/services/core'
import * as A from '../lib/services/abdm';import * as F from '../lib/services/fidelius';import {buildBundles,summarizeBundle} from '../lib/services/abdmfhir'
import {closeEncounter,startEncounter} from '../lib/services/opd'

/** Mock ABDM gateway: ABHA APIs answer like the sandbox (OTP 123456), HIECM calls return 202 and are recorded. */
const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const PUB=(rsa.publicKey.export({type:'spki',format:'der'}) as Buffer).toString('base64')
const dec=(b64:string)=>crypto.privateDecrypt({key:rsa.privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'},Buffer.from(b64,'base64')).toString()
const PROFILE={ABHANumber:'91-1234-5678-9012',firstName:'Asha',lastName:'Verma',gender:'F',dob:'05-03-1990',mobile:'9876543210',phrAddress:['asha.verma@sbx'],stateName:'Karnataka',districtName:'Bengaluru',pinCode:'560001',address:'12 MG Road',kycVerified:true}
type Call=A.GwReq&{at:number};const calls:Call[]=[];const last=(path:string|RegExp)=>[...calls].reverse().find(c=>typeof path==='string'?c.path===path:path.test(c.path))
const mock:A.Gateway={async send(r){calls.push({...r,at:Date.now()});const b=r.body||{}
 switch(r.path){case '/profile/public/certificate':return {status:200,body:{publicKey:PUB}}
  case '/enrollment/request/otp':assert.equal(dec(b.loginId).length,12);return {status:200,body:{txnId:'txn-enrol',message:'OTP sent to Aadhaar-linked mobile ******3210'}}
  case '/enrollment/enrol/byAadhaar':if(dec(b.authData.otp.otpValue)!=='123456')return {status:400,body:{message:'Invalid OTP'}};return {status:200,body:{ABHAProfile:PROFILE,tokens:{token:'x-token-1'},isNew:true}}
  case '/profile/login/request/otp':return {status:200,body:{txnId:'txn-login'}}
  case '/profile/login/verify':if(dec(b.authData.otp.otpValue)!=='123456')return {status:400,body:{message:'Invalid OTP'}};return {status:200,body:{authResult:'success',token:'t-token',txnId:'txn-login-2',accounts:[{ABHANumber:'91-1111-2222-3333',preferredAbhaAddress:'ravi@sbx',name:'Ravi Kumar'},{ABHANumber:'91-4444-5555-6666',preferredAbhaAddress:'ravi2@sbx',name:'Ravi K'}]}}
  case '/profile/login/verify/user':assert.equal(r.headers?.['T-token'],'Bearer t-token');return {status:200,body:{token:'x-token-2'}}
  case '/profile/account':return {status:200,body:r.headers?.['X-token']==='Bearer x-token-2'?{ABHANumber:'91-4444-5555-6666',name:'Ravi K',gender:'M',yearOfBirth:1985,monthOfBirth:7,dayOfBirth:1,mobile:'9123400001',preferredAbhaAddress:'ravi2@sbx'}:PROFILE}
  case '/profile/account/abha-card':return {status:200,body:{contentType:'image/png',data:'iVBORw0KGgo='}}}
 return {status:202,body:null}}}
const H=(hip='HIP-TEST')=>({'request-id':crypto.randomUUID(),'x-hip-id':hip,timestamp:new Date().toISOString()})

let db:Db,T:any,rec:any,doc:any
before(async()=>{db=await freshDb();T=await tenant(db,'Abdm General');rec=await T.mk('reception','Rita Desk');doc=await T.mk('doctor','Dr Meera Rao');A.setGateway(mock);A.setCallbackVerifier(async h=>h.authorization==='Bearer good')
 await A.saveSettings(db,T.admin,{mode:'sandbox',hfrId:'IN2910000001',hipId:'HIP-TEST',hiuId:'HIU-TEST',hipName:'Abdm General',counterCode:'desk1'})})
after(()=>{A.setGateway(null);A.setCallbackVerifier(null)})

test('settings: admin only, ids validated, UI lists what is still missing for live use',async()=>{
 await assert.rejects(A.saveSettings(db,rec,{mode:'sandbox'}),/role/)
 await assert.rejects(A.saveSettings(db,T.admin,{mode:'sandbox',hipId:'bad id!'}),/HIP id/)
 const o=await A.abdmOverview(db,T.admin);assert.equal(o.settings.mode,'sandbox');assert.equal(o.credentials,false,'no env credentials in tests')
 assert.ok(o.missing.some((m:string)=>m.includes('ABDM_CLIENT_ID')),'tells the admin which env vars to set');assert.ok(o.missing.some((m:string)=>m.includes('bridge URL')))
 const v=await A.verifyGatewayRequest({authorization:'Bearer good'});assert.ok(v.ok);assert.equal((await A.verifyGatewayRequest({authorization:'Bearer bad'})).status,401)
 A.setCallbackVerifier(null);assert.equal((await A.verifyGatewayRequest({authorization:'Bearer x'})).status,503,'fails closed without credentials');A.setCallbackVerifier(async h=>h.authorization==='Bearer good')})

test('M1: create ABHA with Aadhaar OTP, register the patient from it; Aadhaar and OTP never stored',async()=>{
 const s=await A.abhaStart(db,rec,{flow:'enrol',aadhaar:'2345 6789 0123'});assert.ok(s.sessionId)
 await assert.rejects(A.abhaVerify(db,rec,{sessionId:s.sessionId,otp:'000000',mobile:'9876543210'}),/Invalid OTP/)
 const v:any=await A.abhaVerify(db,rec,{sessionId:s.sessionId,otp:'123456',mobile:'9876543210'});assert.equal(v.profile.abhaNumber,'91-1234-5678-9012');assert.equal(v.profile.dob,'1990-03-05');assert.equal(v.isNew,true)
 const l=await A.abhaLink(db,rec,{sessionId:s.sessionId});assert.equal(l.created,true);const p=l.patient
 assert.equal(p.full_name,'Asha Verma');assert.equal(p.gender,'Female');assert.equal(p.mobile,'+919876543210');assert.equal(p.abha_address,'asha.verma@sbx');assert.equal(p.abha_status,'linked');assert.equal(p.abha_kyc,'verified');assert.equal(p.pincode,'560001')
 const card=await A.abhaCard(db,rec,s.sessionId);assert.equal(card.contentType,'image/png')
 const log=JSON.stringify((await db.query('select payload,response from abdm_requests')).rows);assert.ok(!log.includes('234567890123'),'Aadhaar never logged');assert.ok(!log.includes('x-token-1'),'user tokens redacted');assert.ok(log.includes('***'))
 await assert.rejects(A.abhaLink(db,rec,{sessionId:s.sessionId}),/expired|used/,'session is single-use')})

test('M1: verify an existing ABHA by mobile (two accounts → choose), link to an existing patient and fill blanks',async()=>{
 const pid=(await db.query("insert into patients(hospital_id,uhid,full_name) values($1,'ABDM-T-1','Ravi K') returning id",[T.h.hospitalId])).rows[0].id
 const s=await A.abhaStart(db,rec,{flow:'mobile',mobile:'9123400001',patientId:pid});const v:any=await A.abhaVerify(db,rec,{sessionId:s.sessionId,otp:'123456'})
 assert.equal(v.choose.length,2);const c=await A.abhaChoose(db,rec,{sessionId:s.sessionId,abhaNumber:'91444455556666'});assert.equal(c.profile.abhaAddress,'ravi2@sbx')
 const l=await A.abhaLink(db,rec,{sessionId:s.sessionId});assert.equal(l.created,false);assert.equal(l.patient.id,pid);assert.equal(l.patient.abha_number,'91-4444-5555-6666');assert.equal(l.patient.gender,'Male');assert.equal(String(l.patient.date_of_birth instanceof Date?l.patient.date_of_birth.toISOString():l.patient.date_of_birth).slice(0,10),'1985-07-01')
 // same ABHA on a second patient is refused
 const other=(await db.query("insert into patients(hospital_id,uhid,full_name) values($1,'ABDM-T-2','Someone') returning id",[T.h.hospitalId])).rows[0].id
 const s2=await A.abhaStart(db,rec,{flow:'abha',abhaNumber:'91-4444-5555-6666',otpSystem:'abdm',patientId:other});await A.abhaVerify(db,rec,{sessionId:s2.sessionId,otp:'123456'})
 await assert.rejects(A.abhaLink(db,rec,{sessionId:s2.sessionId}),/already linked/)
 assert.deepEqual(last('/profile/login/request/otp')!.body.scope,['abha-login','mobile-verify'])})

test('Scan & Share: shared profile creates the patient, issues a desk token, replies on-share; front desk gives the OPD token',async()=>{
 const qr:any=await A.facilityQr(db,rec);assert.equal(qr.configured,true);assert.match(qr.url,/hip-id=HIP-TEST&counter-id=desk1/);assert.match(qr.svg,/<svg/)
 const share={intent:'PROFILE_SHARE',metaData:{hipId:'HIP-TEST',context:'desk1',hprId:'',latitude:'',longitude:''},profile:{patient:{abhaNumber:'91-7777-8888-9999',abhaAddress:'kiran@sbx',name:'Kiran Shah',gender:'M',dayOfBirth:'12',monthOfBirth:'8',yearOfBirth:'1979',phoneNumber:'9988776655',address:{line:'4 Lake View',district:'Pune',state:'Maharashtra',pincode:'411001'}}}}
 const r=await A.handleCallback(db,'/api/v3/hip/patient/share',H(),share);assert.equal(r.created,true);assert.equal(r.tokenNo,1)
 const on=last('/patient-share/v3/on-share')!;assert.equal(on.body.acknowledgement.profile.tokenNumber,'1');assert.equal(on.body.acknowledgement.status,'SUCCESS');assert.equal(on.headers!['X-HIP-ID'],'HIP-TEST')
 const again=await A.handleCallback(db,'/api/v3/hip/patient/share',H(),share);assert.equal(again.tokenNo,1,'re-scan the same day keeps the token');assert.equal(again.patientId,r.patientId)
 const list=await A.listShares(db,rec);assert.equal(list.length,1);assert.equal(list[0].full_name,'Kiran Shah')
 const v:any=await A.checkinShare(db,rec,list[0].id,{doctorId:doc.userId});assert.ok(v.token.token_no>=1)
 const after=(await A.listShares(db,rec))[0];assert.equal(after.status,'checked_in');assert.equal(after.opd_token,v.token.token_no)
 assert.equal((await A.handleCallback(db,'/api/v3/hip/patient/share',H('NOPE'),{...share,metaData:{...share.metaData,hipId:'NOPE'}})).error,'Unknown HIP id')})

async function closedVisit(pid:string){await db.query("insert into patient_assignments(hospital_id,patient_id,doctor_user_id) values($1,$2,$3)",[T.h.hospitalId,pid,doc.userId]);const e=await startEncounter(db,doc,{patientId:pid})
 await db.query("insert into vitals(hospital_id,patient_id,encounter_id,pulse,bp_systolic,bp_diastolic,recorded_by) values($1,$2,$3,78,124,82,$4)",[T.h.hospitalId,pid,e.id,doc.userId]);await db.query("insert into diagnoses(hospital_id,encounter_id,patient_id,icd10_code,description) values($1,$2,$3,'J06.9','Acute upper respiratory infection')",[T.h.hospitalId,e.id,pid])
 const rx=(await db.query("insert into prescriptions(hospital_id,patient_id,doctor_user_id,encounter_id) values($1,$2,$3,$4) returning id",[T.h.hospitalId,pid,doc.userId,e.id])).rows[0].id;await db.query("insert into prescription_items(prescription_id,medicine_name,dose,frequency,duration) values($1,'Paracetamol 500mg','1 tab','TDS','3 days')",[rx])
 await closeEncounter(db,doc,{encounterId:e.id,chiefComplaint:'Fever and sore throat',examination:'Throat congested',advice:'Warm fluids'});return e.id}

test('M2 HIP-initiated linking: closing a visit creates a care context, gets a link token, links it',async()=>{
 const pid=(await db.query("select id from patients where abha_address='asha.verma@sbx'")).rows[0].id;const eid=await closedVisit(pid)
 const cc=(await db.query("select * from abdm_care_contexts where ref_id=$1",[eid])).rows[0];assert.ok(cc,'care context created by the visit hook');assert.deepEqual(cc.hi_types,['OPConsultation','Prescription'])
 const gen=last('/v3/token/generate-token')!;assert.equal(gen.body.abhaNumber,91123456789012);assert.equal(gen.body.gender,'F');assert.equal(gen.headers!['X-HIP-ID'],'HIP-TEST')
 await A.handleCallback(db,'/api/v3/hip/token/on-generate-token',H(),{abhaAddress:'asha.verma@sbx',linkToken:'LT-1',response:{requestId:gen.headers!['REQUEST-ID']}})
 const link=last('/hip/v3/link/carecontext')!;assert.equal(link.headers!['X-LINK-TOKEN'],'LT-1');assert.equal(link.body.patient[0].careContexts[0].referenceNumber,cc.reference);assert.equal(link.body.patient[0].hiType,'OPConsultation')
 assert.equal((await db.query('select status from abdm_care_contexts where id=$1',[cc.id])).rows[0].status,'linking')
 await A.handleCallback(db,'/api/v3/link/on_carecontext',H(),{abhaAddress:'asha.verma@sbx',status:'Successfully Linked care context',response:{requestId:link.headers!['REQUEST-ID']}})
 const done=(await db.query('select status,linked_via from abdm_care_contexts where id=$1',[cc.id])).rows[0];assert.deepEqual(done,{status:'linked',linked_via:'hip'})
 assert.equal((await db.query("select status from abdm_requests where request_id=$1 and direction='out'",[link.headers!['REQUEST-ID']])).rows[0].status,'callback','request log shows the callback')})

test('M2 user-initiated linking: discover → init (OTP to patient) → confirm',async()=>{
 const pid=(await db.query("insert into patients(hospital_id,uhid,full_name,mobile,gender,date_of_birth) values($1,'ABDM-T-3','Sunita Rao','+919000011111','Female','1970-02-02') returning id",[T.h.hospitalId])).rows[0].id;await closedVisit(pid)
 const txn=crypto.randomUUID();const d=await A.handleCallback(db,'/api/v3/hip/patient/care-context/discover',H(),{transactionId:txn,patient:{id:'sunita@sbx',name:'Sunita Rao',gender:'F',yearOfBirth:1970,verifiedIdentifiers:[{type:'MOBILE',value:'9000011111'}],unverifiedIdentifiers:[]}})
 assert.equal(d.patientId,pid);const od=last(/on-discover$/)!;assert.deepEqual(od.body.matchedBy,['MOBILE']);const ccRef=od.body.patient[0].careContexts[0].referenceNumber;assert.equal(od.body.patient[0].referenceNumber,'ABDM-T-3')
 await A.handleCallback(db,'/api/v3/hip/patient/care-context/discover',H(),{transactionId:crypto.randomUUID(),patient:{id:'x@sbx',name:'Nobody',verifiedIdentifiers:[{type:'MOBILE',value:'9000099999'}]}});assert.equal(last(/on-discover$/)!.body.error.code,'ABDM-1010')
 const i=await A.handleCallback(db,'/api/v3/hip/link/care-context/init',H(),{transactionId:txn,abhaAddress:'sunita@sbx',patient:[{referenceNumber:'ABDM-T-3',careContexts:[{referenceNumber:ccRef}],hiType:'OPConsultation',count:1}]})
 const oi=last(/link\/care-context\/on-init$/)!;assert.equal(oi.body.link.referenceNumber,i.linkRef);assert.equal(oi.body.link.authenticationType,'DIRECT')
 const otp=(await db.query("select body from notification_outbox where kind='abdm_link_otp' and patient_id=$1",[pid])).rows[0].body.match(/^\d{6}/)[0]
 await A.handleCallback(db,'/api/v3/hip/link/care-context/confirm',H(),{confirmation:{linkRefNumber:i.linkRef,token:'000000'}});assert.match(last(/on-confirm$/)!.body.error.message,/Invalid OTP/)
 const c=await A.handleCallback(db,'/api/v3/hip/link/care-context/confirm',H(),{confirmation:{linkRefNumber:i.linkRef,token:otp}});assert.equal(c.linked,1)
 assert.equal(last(/on-confirm$/)!.body.patient[0].careContexts[0].referenceNumber,ccRef);assert.equal((await db.query('select status,linked_via from abdm_care_contexts where reference=$1',[ccRef])).rows[0].linked_via,'patient')
 assert.equal((await db.query('select abha_address from patients where id=$1',[pid])).rows[0].abha_address,'sunita@sbx')})

test('FHIR: OPConsultation, Prescription, DiagnosticReport and DischargeSummary bundles follow the NRCeS document shape',async()=>{
 const pid=(await db.query("select id from patients where abha_address='asha.verma@sbx'")).rows[0].id;const cc=(await db.query("select * from abdm_care_contexts where patient_id=$1 and kind='visit'",[pid])).rows[0]
 const bs=await buildBundles(db,T.h.hospitalId,cc);assert.deepEqual(bs.map(b=>b.hiType),['OPConsultation','Prescription'])
 for(const {bundle:b} of bs){assert.equal(b.resourceType,'Bundle');assert.equal(b.type,'document');assert.ok(b.meta.profile[0].endsWith('DocumentBundle'));const comp=b.entry[0].resource;assert.equal(comp.resourceType,'Composition','Composition is the first entry');assert.equal(comp.status,'final')
  const urls=new Set(b.entry.map((e:any)=>e.fullUrl));for(const s of comp.section)for(const e of s.entry)assert.ok(urls.has(e.reference),'every section entry resolves inside the bundle');assert.ok(urls.has(comp.subject.reference));assert.ok(urls.has(comp.author[0].reference))
  const pat=b.entry.find((e:any)=>e.resource.resourceType==='Patient').resource;assert.equal(pat.identifier.find((i:any)=>i.type.coding[0].code==='ABHA').value,'91-1234-5678-9012');assert.equal(pat.gender,'female')
  assert.equal(b.entry.find((e:any)=>e.resource.resourceType==='Organization').resource.identifier[0].value,'IN2910000001','HFR id on the organization')}
 const op=bs[0].bundle;assert.ok(op.entry[0].resource.meta.profile[0].endsWith('OPConsultRecord'));assert.equal(op.entry[0].resource.type.coding[0].code,'371530004')
 assert.ok(op.entry.some((e:any)=>e.resource.resourceType==='Condition'&&e.resource.code.coding[0].code==='J06.9'));assert.ok(op.entry.some((e:any)=>e.resource.resourceType==='Observation'&&e.resource.code.coding?.[0]?.code==='8480-6'&&e.resource.valueQuantity.value===124))
 assert.ok(bs[1].bundle.entry[0].resource.meta.profile[0].endsWith('PrescriptionRecord'));assert.equal(bs[1].bundle.entry.filter((e:any)=>e.resource.resourceType==='MedicationRequest').length,1)
 const sum=summarizeBundle(op);assert.equal(sum.title,'Consultation Report');assert.ok(sum.sections.some((s:any)=>s.items.some((i:string)=>i.includes('Paracetamol'))))
 // lab report
 const oid=(await db.query("insert into diagnostic_orders(hospital_id,patient_id,test_name,category,status,ordered_by,result_text,resulted_by,resulted_at) values($1,$2,'Haemoglobin','lab','completed',$3,'Hb 12.8 g/dL',$3,now()) returning id",[T.h.hospitalId,pid,doc.userId])).rows[0].id
 const [lab]=await buildBundles(db,T.h.hospitalId,{kind:'lab',ref_id:oid,patient_id:pid});assert.equal(lab.hiType,'DiagnosticReport');const dr=lab.bundle.entry.find((e:any)=>e.resource.resourceType==='DiagnosticReport').resource;assert.equal(dr.conclusion,'Hb 12.8 g/dL');assert.ok(lab.bundle.entry.some((e:any)=>e.fullUrl===dr.result[0].reference))
 // discharge summary
 const bed=(await db.query("insert into beds(hospital_id,ward,bed_no) values($1,'General','G1') returning id",[T.h.hospitalId])).rows[0].id;const adm=(await db.query("insert into admissions(hospital_id,patient_id,bed_id,admitting_doctor_id,admission_no,reason,status,discharged_at,discharge_summary,discharge_diagnosis,discharge_advice,created_by) values($1,$2,$3,$4,'IP-1','Dengue fever','discharged',now(),'Recovered with fluids','Dengue fever, resolved','Rest, review in 1 week',$4) returning id",[T.h.hospitalId,pid,bed,doc.userId])).rows[0].id
 const [ds]=await buildBundles(db,T.h.hospitalId,{kind:'discharge',ref_id:adm,patient_id:pid});assert.equal(ds.hiType,'DischargeSummary');assert.ok(ds.bundle.entry[0].resource.meta.profile[0].endsWith('DischargeSummaryRecord'));assert.equal(ds.bundle.entry.find((e:any)=>e.resource.resourceType==='Encounter').resource.class.code,'IMP')
 assert.deepEqual(await buildBundles(db,T.h.hospitalId,{kind:'discharge',ref_id:adm,patient_id:pid},['OPConsultation']),[],'filtered by consented HI types')})

test('Fidelius: X25519 + HKDF + AES-GCM round trip; wrong key or tampering fails; raw 32-byte keys accepted',()=>{
 const hiu=F.generateKeyPair(),hip=F.generateKeyPair();const msg=JSON.stringify({resourceType:'Bundle',note:'नमस्ते'})
 const ct=F.encrypt(msg,hip,{publicKey:hiu.publicKey,nonce:hiu.nonce});assert.notEqual(ct,msg);assert.equal(F.decrypt(ct,hiu,{publicKey:hip.publicKey,nonce:hip.nonce}),msg)
 assert.throws(()=>F.decrypt(ct,F.generateKeyPair(),{publicKey:hip.publicKey,nonce:hip.nonce}));const bad=Buffer.from(ct,'base64');bad[0]^=1;assert.throws(()=>F.decrypt(bad.toString('base64'),hiu,{publicKey:hip.publicKey,nonce:hip.nonce}))
 const raw=Buffer.from(hiu.publicKey,'base64').subarray(-32).toString('base64');assert.equal(F.decrypt(F.encrypt(msg,hip,{publicKey:raw,nonce:hiu.nonce}),hiu,{publicKey:hip.publicKey,nonce:hip.nonce}),msg)
 const km=F.keyMaterial(hiu);assert.equal(km.curve,'Curve25519');assert.equal(Buffer.from(km.nonce,'base64').length,32)})

test('M2 HIP data flow: consent notify → HI request → encrypted FHIR pushed to the HIU → gateway notified',async()=>{
 const p=(await db.query("select id,uhid from patients where abha_address='asha.verma@sbx'")).rows[0];const cc=(await db.query("select reference from abdm_care_contexts where patient_id=$1 and kind='visit'",[p.id])).rows[0]
 const cid=crypto.randomUUID();const from=new Date(Date.now()-30*86400e3).toISOString(),to=new Date(Date.now()+86400e3).toISOString()
 await A.handleCallback(db,'/api/v3/consent/request/hip/notify',H(),{notification:{consentId:cid,status:'GRANTED',signature:'sig',consentDetail:{consentId:cid,patient:{id:'asha.verma@sbx'},careContexts:[{patientReference:p.uhid,careContextReference:cc.reference}],hip:{id:'HIP-TEST'},hiTypes:['OPConsultation','Prescription'],permission:{accessMode:'VIEW',dateRange:{from,to},dataEraseAt:new Date(Date.now()+7*86400e3).toISOString()}}}})
 assert.equal(last('/consent/v3/request/hip/on-notify')!.body.acknowledgement.consentId,cid)
 const hiu=F.generateKeyPair();const txn=crypto.randomUUID()
 const r=await A.handleCallback(db,'/api/v3/hip/health-information/request',H(),{transactionId:txn,hiRequest:{consent:{id:cid},dateRange:{from,to},dataPushUrl:'https://hiu.example/data-push',keyMaterial:F.keyMaterial(hiu)}})
 assert.ok(r.transferId);assert.equal(last('/data-flow/v3/health-information/hip/on-request')!.body.hiRequest.sessionStatus,'ACKNOWLEDGED')
 const push=last('https://hiu.example/data-push')!;assert.equal(push.svc,'url');assert.equal(push.body.transactionId,txn);assert.equal(push.body.entries.length,2)
 for(const e of push.body.entries){assert.equal(e.checksum,F.checksum(e.content));const b=JSON.parse(F.decrypt(e.content,hiu,{publicKey:push.body.keyMaterial.dhPublicKey.keyValue,nonce:push.body.keyMaterial.nonce}));assert.equal(b.type,'document')}
 const n=last('/data-flow/v3/health-information/notify')!;assert.equal(n.body.notification.statusNotification.sessionStatus,'TRANSFERRED');assert.equal(n.body.notification.statusNotification.statusResponses[0].hiStatus,'DELIVERED')
 // revoked consent → request refused
 await A.handleCallback(db,'/api/v3/consent/request/hip/notify',H(),{notification:{consentId:cid,status:'REVOKED'}})
 const r2=await A.handleCallback(db,'/api/v3/hip/health-information/request',H(),{transactionId:crypto.randomUUID(),hiRequest:{consent:{id:cid},dateRange:{from,to},dataPushUrl:'https://hiu.example/data-push',keyMaterial:F.keyMaterial(hiu)}})
 assert.match(r2.error,/REVOKED/);assert.equal(last('/data-flow/v3/health-information/hip/on-request')!.body.hiRequest.sessionStatus,'ERROR')})

test('M3 HIU: consent request → granted → fetch → HI request → data push decrypted and shown; revoke erases it',async()=>{
 const pid=(await db.query("select id from patients where abha_address='kiran@sbx'")).rows[0].id
 await assert.rejects(A.createConsentRequest(db,rec,{patientId:pid}),/role/)
 const c=await A.createConsentRequest(db,doc,{patientId:pid,purpose:'CAREMGT',hiTypes:['OPConsultation','DiagnosticReport']});assert.equal(c.status,'REQUESTED');assert.equal(c.abha_address,'kiran@sbx')
 const init=last('/consent/v3/request/init')!;assert.equal(init.body.consent.patient.id,'kiran@sbx');assert.equal(init.body.consent.hiu.id,'HIU-TEST');assert.deepEqual(init.body.consent.hiTypes,['OPConsultation','DiagnosticReport'])
 await A.handleCallback(db,'/api/v3/hiu/consent/request/on-init',H(),{consentRequest:{id:'CR-1'},response:{requestId:init.headers!['REQUEST-ID']}})
 assert.equal((await db.query('select consent_request_id from abdm_consents where id=$1',[c.id])).rows[0].consent_request_id,'CR-1')
 await A.handleCallback(db,'/api/v3/hiu/consent/request/notify',H(),{notification:{consentRequestId:'CR-1',status:'GRANTED',consentArtefacts:[{id:'ART-1'}]}})
 assert.equal((await db.query('select status from abdm_consents where id=$1',[c.id])).rows[0].status,'GRANTED');assert.deepEqual(last('/consent/v3/request/hiu/on-notify')!.body.acknowledgement,[{status:'ok',consentId:'ART-1'}])
 const fetch=last('/consent/v3/fetch')!;assert.equal(fetch.body.consentId,'ART-1')
 const from=new Date(Date.now()-365*86400e3).toISOString(),to=new Date().toISOString()
 await A.handleCallback(db,'/api/v3/hiu/consent/on-fetch',H(),{consent:{status:'GRANTED',signature:'s',consentDetail:{consentId:'ART-1',hip:{id:'OTHER-HIP',name:'City Clinic'},careContexts:[{patientReference:'P1',careContextReference:'CC-9'}],hiTypes:['OPConsultation'],permission:{dateRange:{from,to},dataEraseAt:new Date(Date.now()+30*86400e3).toISOString()}}},response:{requestId:fetch.headers!['REQUEST-ID']}})
 const hr=last('/data-flow/v3/health-information/request')!;assert.equal(hr.body.hiRequest.consent.id,'ART-1');const km=hr.body.hiRequest.keyMaterial;assert.equal(km.cryptoAlg,'ECDH');const transferId=hr.body.hiRequest.dataPushUrl.split('/').pop()
 await A.handleCallback(db,'/api/v3/hiu/health-information/on-request',H(),{hiRequest:{transactionId:'TXN-9',sessionStatus:'ACKNOWLEDGED'},response:{requestId:hr.headers!['REQUEST-ID']}})
 // the other hospital (HIP) encrypts with our key material
 const hip=F.generateKeyPair();const bundle={resourceType:'Bundle',type:'document',entry:[{fullUrl:'urn:uuid:c1',resource:{resourceType:'Composition',meta:{profile:['https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord']},title:'OP consult at City Clinic',date:'2026-10-01',author:[{display:'Dr Sen'}],section:[{title:'Medications',entry:[{reference:'urn:uuid:m1'}]}]}},{fullUrl:'urn:uuid:m1',resource:{resourceType:'MedicationRequest',medicationCodeableConcept:{text:'Amoxicillin 500mg'},dosageInstruction:[{text:'BD x 5 days'}]}}]}
 const content=F.encrypt(JSON.stringify(bundle),hip,{publicKey:km.dhPublicKey.keyValue,nonce:km.nonce})
 await assert.rejects(A.receiveDataPush(db,transferId,{transactionId:'WRONG',entries:[],keyMaterial:F.keyMaterial(hip)}),/mismatch/)
 await assert.rejects(A.receiveDataPush(db,crypto.randomUUID(),{transactionId:'TXN-9',entries:[],keyMaterial:F.keyMaterial(hip)}),/Unknown/)
 const got=await A.receiveDataPush(db,transferId,{pageNumber:1,pageCount:1,transactionId:'TXN-9',entries:[{content,media:'application/fhir+json',checksum:F.checksum(content),careContextReference:'CC-9'}],keyMaterial:F.keyMaterial(hip)});assert.equal(got.received,1)
 assert.equal(last('/data-flow/v3/health-information/notify')!.body.notification.notifier.type,'HIU')
 const d=await A.consentDetail(db,doc,c.id);assert.equal(d.records.length,1);assert.equal(d.records[0].hiType,'OPConsultation');assert.equal(d.records[0].summary!.title,'OP consult at City Clinic');assert.deepEqual(d.records[0].summary!.sections[0].items,['Amoxicillin 500mg — BD x 5 days'])
 assert.equal(d.transfers[0].status,'RECEIVED');assert.equal((await db.query('select private_key from abdm_hi_transfers where id=$1',[transferId])).rows[0].private_key,null,'private key dropped after the last page')
 await assert.rejects(A.receiveDataPush(db,transferId,{transactionId:'TXN-9',entries:[],keyMaterial:F.keyMaterial(hip)}),/closed/,'transfer cannot be replayed')
 assert.equal((await A.receivedRecords(db,doc)).length,1)
 await A.handleCallback(db,'/api/v3/hiu/consent/request/notify',H(),{notification:{consentRequestId:'CR-1',status:'REVOKED',consentArtefacts:[{id:'ART-1'}]}})
 assert.equal((await A.consentDetail(db,doc,c.id)).records.length,0,'records erased on revoke');assert.equal((await db.query('select status from abdm_consents where id=$1',[c.id])).rows[0].status,'REVOKED')})

test('off mode: ABHA steps explain what to do; clinical hooks stay silent; tenants are isolated',async()=>{
 const T2=await tenant(db,'Other Hospital');const r2=await T2.mk('reception','Other Desk')
 await assert.rejects(A.abhaStart(db,r2,{flow:'mobile',mobile:'9123456789'}),/ABDM is off/);const q:any=await A.facilityQr(db,r2);assert.equal(q.configured,false)
 assert.equal((await A.listShares(db,r2)).length,0);assert.equal((await A.listRequests(db,T2.admin)).length,0)
 await assert.rejects(A.consentDetail(db,{...T2.admin},(await db.query('select id from abdm_consents limit 1')).rows[0].id),/not found/)})
