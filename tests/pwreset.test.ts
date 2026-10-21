import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers';import {requestReset,completeReset,emailInvite} from '../lib/services/pwreset';import {authenticate} from '../lib/services/auth'
test('password reset + invite links: one-time, hashed, no enumeration, tenant-scoped',async()=>{const db=await freshDb();const t=await tenant(db,'Reset Care');const rec=await t.mk('reception','R R');const o=await tenant(db,'Reset Other')
 process.env.RESEND_API_KEY='test';process.env.EMAIL_FROM='noreply@hms.test';const sent:any[]=[];const f:any=async(_u:string,init:any)=>{sent.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'m1'}),{status:200})}
 const email='admin@resetcare.in'
 assert.deepEqual((await requestReset(db,'nobody@x.in',undefined,f)).ok,true);assert.equal(sent.length,0)
 await requestReset(db,email,undefined,f);assert.equal(sent.length,1);const tok=String(sent[0].text||sent[0].html).match(/t=([\w-]+)/)![1]
 assert.equal((await db.query('select count(*)::int n from password_resets where token_hash=$1',[tok])).rows[0].n,0,'raw token not stored')
 await assert.rejects(completeReset(db,tok,'short'),/10/);await completeReset(db,tok,'Brand-new-pass1');await assert.rejects(completeReset(db,tok,'Brand-new-pass2'),/expired|used/)
 assert.ok(await authenticate(db,email,'Brand-new-pass1'))
 const r=await emailInvite(db,t.admin,rec.userId,f);assert.ok(r.sentTo);await assert.rejects(emailInvite(db,o.admin,rec.userId,f),/not found/);await assert.rejects(emailInvite(db,rec,rec.userId,f),/role|admin|permission/i)
 delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM})
