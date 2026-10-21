import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {listIntegrations,saveIntegration,disconnect,testIntegration,providersFor,encrypt,decrypt,createMeet,waWebhookSecrets} from '../lib/services/integrations'
process.env.INTEGRATIONS_ENC_KEY='test-key-not-secret';process.env.SESSION_SECRET=process.env.SESSION_SECRET||'test-session'
for(const k of ['WHATSAPP_TOKEN','WHATSAPP_PHONE_NUMBER_ID','RESEND_API_KEY','EMAIL_FROM','SMTP_URL','GOOGLE_SERVICE_ACCOUNT_JSON'])delete process.env[k]
test('integrations: per-hospital, encrypted at rest, masked, admin-only, audited, isolated, env fallback',async()=>{const db=await freshDb();const a=await tenant(db,'Alpha Care');const b=await tenant(db,'Beta Care')
 assert.deepEqual(decrypt(encrypt({x:'1'})),{x:'1'})
 let l:any=(await listIntegrations(db,a.admin)).integrations;assert.equal(l.whatsapp.status,'not_configured');assert.match(l.whatsapp.webhookUrl,new RegExp('/api/webhooks/whatsapp/'+a.admin.hospitalId))
 l=(await saveIntegration(db,a.admin,'whatsapp',{config:{phoneNumberId:'1234567890'},secrets:{accessToken:'EAAG-super-secret-token-9876',appSecret:'appsecret-abcd',verifyToken:'verify-me-1234'}})).integrations
 assert.equal(l.whatsapp.status,'configured');assert.equal(l.whatsapp.secrets.accessToken,'••••9876');assert.ok(!JSON.stringify(l).includes('super-secret'))
 const raw=(await db.query("select secrets from hospital_integrations where kind='whatsapp'")).rows[0].secrets;assert.ok(!raw.includes('super-secret'),'encrypted at rest')
 // blank / masked secret keeps the stored one
 await saveIntegration(db,a.admin,'whatsapp',{config:{phoneNumberId:'1234567890'},secrets:{accessToken:'••••9876',appSecret:''}});assert.equal((await waWebhookSecrets(db,a.admin.hospitalId)).appSecret,'appsecret-abcd')
 await assert.rejects(saveIntegration(db,a.admin,'whatsapp',{config:{phoneNumberId:'abc'}}),/digits/)
 // non-admin refused
 const rec=await a.mk('reception','Rita Desk');await assert.rejects(listIntegrations(db,rec as any),/role/);await assert.rejects(saveIntegration(db,rec as any,'email',{}),/role/)
 // isolation: Beta sees nothing of Alpha
 assert.equal((await listIntegrations(db,b.admin)).integrations.whatsapp.status,'not_configured');assert.equal((await waWebhookSecrets(db,b.admin.hospitalId)).appSecret,'')
 // test-send uses hospital's own credentials; success => connected, failure => error
 const calls:any[]=[];const ok:any=async(u:string,o:any)=>{calls.push({u,o});return new Response(JSON.stringify({messages:[{id:'wamid.1'}]}),{status:200})}
 const r=await testIntegration(db,a.admin,'whatsapp',{to:'9876543210'},ok);assert.equal(r.sent,true);assert.match(calls[0].u,/1234567890\/messages/);assert.equal(calls[0].o.headers.authorization,'Bearer EAAG-super-secret-token-9876');assert.match(calls[0].o.body,/919876543210/)
 assert.equal((await listIntegrations(db,a.admin)).integrations.whatsapp.status,'connected')
 const bad:any=async()=>new Response(JSON.stringify({error:{message:'Invalid OAuth access token'}}),{status:401})
 await assert.rejects(testIntegration(db,a.admin,'whatsapp',{to:'9876543210'},bad),/Invalid OAuth/);l=(await listIntegrations(db,a.admin)).integrations;assert.equal(l.whatsapp.status,'error');assert.match(l.whatsapp.lastError,/Invalid OAuth/)
 // outbox providers resolve per hospital
 assert.equal((await providersFor(db,a.admin.hospitalId)).whatsapp.configured(),true);assert.equal((await providersFor(db,b.admin.hospitalId)).whatsapp.configured(),false)
 // platform env fallback
 process.env.RESEND_API_KEY='re_platform';process.env.EMAIL_FROM='HMS <no-reply@hms.test>';l=(await listIntegrations(db,b.admin)).integrations;assert.equal(l.email.source,'platform');assert.equal(l.email.status,'platform');assert.equal((await providersFor(db,b.admin.hospitalId)).email.configured(),true);delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM
 // e-mail per hospital via Resend
 await saveIntegration(db,b.admin,'email',{config:{provider:'resend',from:'Beta <bills@beta.in>'},secrets:{resendKey:'re_beta_key_5555'}});const em:any[]=[];await testIntegration(db,b.admin,'email',{to:'x@y.in'},(async(u:string,o:any)=>{em.push(o);return new Response('{"id":"e1"}',{status:200})}) as any);assert.equal(em[0].headers.authorization,'Bearer re_beta_key_5555');assert.match(em[0].body,/bills@beta.in/)
 // disconnect wipes secrets
 await disconnect(db,a.admin,'whatsapp');assert.equal((await db.query("select secrets from hospital_integrations where hospital_id=$1 and kind='whatsapp'",[a.admin.hospitalId])).rows[0].secrets,null);assert.equal((await providersFor(db,a.admin.hospitalId)).whatsapp.configured(),false)
 // Meet: dry-run without Google
 assert.equal((await createMeet(db,a.admin.hospitalId,{summary:'x',start:new Date(),end:new Date()})).dryRun,true)
 const au=(await db.query("select action,details::text d from audit_log where hospital_id=$1 and entity='integration'",[a.admin.hospitalId])).rows;assert.ok(au.some(x=>x.action==='integration_saved'));assert.ok(au.some(x=>x.action==='integration_disconnected'));assert.ok(!au.some(x=>x.d.includes('super-secret')))})
test('google: connected account creates a Meet event with the hospital refresh token',async()=>{const db=await freshDb();const a=await tenant(db,'Gamma Care');process.env.GOOGLE_CLIENT_ID='cid';process.env.GOOGLE_CLIENT_SECRET='csec'
 await saveIntegration(db,a.admin,'google',{config:{calendarId:'primary'},secrets:{refreshToken:'1//refresh-gamma'}})
 const seen:string[]=[];const f:any=async(u:string,o:any)=>{seen.push(u+' '+String(o?.body||''));if(u.includes('oauth2'))return new Response('{"access_token":"at"}',{status:200});return new Response(JSON.stringify({id:'ev1',hangoutLink:'https://meet.google.com/abc-defg-hij'}),{status:200})}
 const m=await createMeet(db,a.admin.hospitalId,{summary:'Video consult',start:new Date(),end:new Date(Date.now()+9e5),attendees:['p@x.in']},f);assert.equal(m.meetUrl,'https://meet.google.com/abc-defg-hij');assert.match(seen[0],/refresh-gamma/);assert.match(seen[1],/conferenceDataVersion=1.*hangoutsMeet/)})
