import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb, tenant} from './helpers'
import {onboardHospital, createStaff} from '../lib/services/tenancy'
import {authenticate} from '../lib/services/auth'
import {emailVerificationStatus, issueEmailCode, resetEmailVerificationCache, retargetUnverifiedEmail, verifyEmailCode} from '../lib/services/emailverify'

const saved: Record<string, string | undefined> = {}
function setEnv(extra: Record<string, string | undefined>) {
  for (const k of ['RESEND_API_KEY', 'EMAIL_FROM', 'SMTP_URL', 'EMAIL_VERIFICATION', 'SESSION_SECRET']) {
    if (!(k in saved)) saved[k] = process.env[k]
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v == null) delete process.env[k]
    else process.env[k] = v
  }
  resetEmailVerificationCache()
}
function restoreEnv() {
  for (const [k, v] of Object.entries(saved)) {
    if (v == null) delete process.env[k]
    else process.env[k] = v
  }
  resetEmailVerificationCache()
}
const mail = () => {
  const sent: any[] = []
  const f: typeof fetch = (async (_u: string, init: any) => {
    sent.push(JSON.parse(init.body))
    return new Response(JSON.stringify({id: 'm1'}), {status: 200})
  }) as typeof fetch
  return {sent, f}
}
const codeOf = (body: any) => String(body.text || '').match(/\b(\d{6})\b/)?.[1] || ''

describe('email verification', {concurrency: false}, () => {
test('existing accounts stay verified; verification stays off without a mail provider', async () => {
  setEnv({RESEND_API_KEY: undefined, EMAIL_FROM: undefined, SMTP_URL: undefined, EMAIL_VERIFICATION: undefined, SESSION_SECRET: 'test-session-email'})
  try {
    const db = await freshDb()
    const h = await onboardHospital(db, {hospitalName: 'Already Here', adminName: 'Owner', adminEmail: 'owner@already.in', password: 'S3cure-pass!'})
    assert.equal(h.emailVerification, 'off')
    const row = (await db.query('select email_verified_at from users where id=$1', [h.adminUserId])).rows[0]
    assert.ok(row.email_verified_at, 'default stamps the new row until a code is sent')
    assert.equal((await authenticate(db, 'owner@already.in', 'S3cure-pass!')).id, h.adminUserId)
    await db.query('update users set email_verified_at=null where id=$1', [h.adminUserId])
    await db.query('update users set email_verified_at=now() where email_verified_at is null')
    assert.ok((await db.query('select email_verified_at v from users where id=$1', [h.adminUserId])).rows[0].v)
    const st = await emailVerificationStatus(db)
    assert.equal(st.emailVerification, false)
    assert.deepEqual(st.missingEnv, ['RESEND_API_KEY', 'EMAIL_FROM'])
  } finally { restoreEnv() }
})

test('hospital sign-up and new staff must enter the emailed code; hash, expiry, attempts, resend limits', async () => {
  const {sent, f} = mail()
  setEnv({RESEND_API_KEY: 're_test', EMAIL_FROM: 'HMS <noreply@hms.test>', EMAIL_VERIFICATION: undefined, SESSION_SECRET: 'test-session-email'})
  try {
    const db = await freshDb()
    const h = await onboardHospital(db, {hospitalName: 'Code Clinic', adminName: 'Asha', adminEmail: 'asha@code.in', password: 'S3cure-pass!', phone: '9876500001'}, f)
    assert.equal(h.emailVerification, 'sent')
    assert.equal(sent.length, 1)
    assert.match(sent[0].subject, /HMS/)
    assert.equal((await db.query('select email_verified_at from users where id=$1', [h.adminUserId])).rows[0].email_verified_at, null)
    await assert.rejects(authenticate(db, 'asha@code.in', 'S3cure-pass!'), (e: any) => e.status === 403 && e.extra?.needsEmailVerification)
    const code = codeOf(sent[0])
    assert.equal(code.length, 6)
    assert.equal((await db.query('select count(*)::int n from email_otps where code_hash=$1 or email=$1', [code])).rows[0].n, 0, 'code is stored only as a hash')
    const wrong = code === '000000' ? '111111' : '000000'
    await assert.rejects(verifyEmailCode(db, h.adminUserId, wrong), /Wrong code/)
    await verifyEmailCode(db, h.adminUserId, code)
    await assert.rejects(verifyEmailCode(db, h.adminUserId, code), /expired/)
    assert.equal((await authenticate(db, 'asha@code.in', 'S3cure-pass!')).hospital_id, h.hospitalId)

    const admin = {hospitalId: h.hospitalId, userId: h.adminUserId, role: 'admin' as const}
    const staff = await createStaff(db, admin, {role: 'reception', fullName: 'Front Desk', email: 'desk@code.in', password: 'S3cure-pass!'}, f)
    assert.equal(staff.emailVerification, 'sent')
    await assert.rejects(authenticate(db, 'desk@code.in', 'S3cure-pass!'), (e: any) => e.extra?.needsEmailVerification)
    const staffCode = codeOf(sent.at(-1))
    for (let i = 0; i < 5; i++) await assert.rejects(verifyEmailCode(db, staff.id, wrong), /Wrong code/)
    await assert.rejects(verifyEmailCode(db, staff.id, staffCode), /Too many/)
    await db.query("update email_otps set attempts=0, used_at=null, expires_at=now()-interval '1 minute' where user_id=$1", [staff.id])
    await assert.rejects(verifyEmailCode(db, staff.id, staffCode), /expired/)

    await db.query("update email_otps set created_at=now()-interval '40 seconds' where user_id=$1", [staff.id])
    await issueEmailCode(db, {id: staff.id, hospitalId: h.hospitalId, email: 'desk@code.in', fullName: 'Front Desk'}, {fetch: f})
    await assert.rejects(issueEmailCode(db, {id: staff.id, hospitalId: h.hospitalId, email: 'desk@code.in', fullName: 'Front Desk'}, {fetch: f}), (e: any) => e.status === 429 && e.extra?.cooldown && e.extra.resendIn <= 30)
    for (let i = 0; i < 3; i++) {
      await db.query("update email_otps set created_at=now()-interval '40 seconds' where user_id=$1", [staff.id])
      await issueEmailCode(db, {id: staff.id, hospitalId: h.hospitalId, email: 'desk@code.in', fullName: 'Front Desk'}, {fetch: f})
    }
    await db.query("update email_otps set created_at=now()-interval '40 seconds' where user_id=$1", [staff.id])
    await assert.rejects(issueEmailCode(db, {id: staff.id, hospitalId: h.hospitalId, email: 'desk@code.in', fullName: 'Front Desk'}, {fetch: f, ip: '9.9.9.9'}), /15 minutes/)

    process.env.EMAIL_VERIFICATION = 'false'
    resetEmailVerificationCache()
    const other = await tenant(db, 'Quiet Ward')
    delete process.env.EMAIL_VERIFICATION
    resetEmailVerificationCache()
    for (let i = 0; i < 20; i++) await db.query("insert into email_otps(hospital_id,user_id,email,code_hash,expires_at,ip,created_at) values($1,$2,'x@y.in','abc',now()+interval '10 minutes','8.8.8.8',now()-interval '20 minutes')", [other.h.hospitalId, other.admin.userId])
    await assert.rejects(issueEmailCode(db, {id: other.admin.userId, hospitalId: other.h.hospitalId, email: 'admin@quietward.in', fullName: 'A'}, {fetch: f, ip: '8.8.8.8'}), /hour/)
  } finally { restoreEnv() }
})

test('a failed send or an explicit off switch does not block sign-up', async () => {
  setEnv({RESEND_API_KEY: 're_test', EMAIL_FROM: 'HMS <noreply@hms.test>', SESSION_SECRET: 'test-session-email'})
  try {
    const db = await freshDb()
    const bad: typeof fetch = (async () => new Response('{"message":"nope"}', {status: 401})) as typeof fetch
    const h = await onboardHospital(db, {hospitalName: 'Mail Down', adminName: 'A', adminEmail: 'a@maildown.in', password: 'S3cure-pass!', paid: true}, bad)
    assert.equal(h.emailVerification, 'skipped')
    assert.ok((await db.query('select email_verified_at v from users where id=$1', [h.adminUserId])).rows[0].v)
    assert.ok(await authenticate(db, 'a@maildown.in', 'S3cure-pass!'))

    process.env.EMAIL_VERIFICATION = 'false'
    resetEmailVerificationCache()
    const {f} = mail()
    let called = false
    const spy: typeof fetch = (async (...args: Parameters<typeof fetch>) => { called = true; return f(...args) }) as typeof fetch
    const h2 = await onboardHospital(db, {hospitalName: 'Flag Off', adminName: 'A', adminEmail: 'a@flagoff.in', password: 'S3cure-pass!', paid: true}, spy)
    assert.equal(h2.emailVerification, 'off')
    assert.equal(called, false)
    assert.equal((await emailVerificationStatus(db)).emailVerification, false)
    const t = await tenant(db, 'Staff Off')
    const u = await createStaff(db, t.admin, {role: 'nurse', fullName: 'Nia', email: 'nia@staffoff.in', password: 'S3cure-pass!'}, spy)
    assert.equal(u.emailVerification, 'off')
    assert.ok(await authenticate(db, 'nia@staffoff.in', 'S3cure-pass!'))
  } finally { restoreEnv() }
})

test('an unverified admin can correct the email before the code is accepted', async () => {
  const {sent, f} = mail()
  setEnv({RESEND_API_KEY: 're_test', EMAIL_FROM: 'HMS <noreply@hms.test>', EMAIL_VERIFICATION: undefined, SESSION_SECRET: 'test-session-email'})
  try {
    const db = await freshDb()
    const h = await onboardHospital(db, {hospitalName: 'Typo Hospital', adminName: 'A', adminEmail: 'typo@fix.in', password: 'S3cure-pass!', phone: '9876500099'}, f)
    await assert.rejects(retargetUnverifiedEmail(db, h.adminUserId, h.hospitalId, 'not-an-email'), /invalid/i)
    const next = await retargetUnverifiedEmail(db, h.adminUserId, h.hospitalId, 'right@fix.in')
    assert.equal(next, 'right@fix.in')
    assert.equal((await db.query('select email from users where id=$1', [h.adminUserId])).rows[0].email, 'right@fix.in')
    assert.equal((await db.query("select norm from trial_claims where hospital_id=$1 and kind='email'", [h.hospitalId])).rows[0].norm, 'right@fix.in')
    await db.query("update email_otps set created_at=now()-interval '40 seconds' where user_id=$1", [h.adminUserId])
    await issueEmailCode(db, {id: h.adminUserId, hospitalId: h.hospitalId, email: next, fullName: 'A'}, {fetch: f})
    await verifyEmailCode(db, h.adminUserId, codeOf(sent.at(-1)))
    assert.equal((await authenticate(db, 'right@fix.in', 'S3cure-pass!')).id, h.adminUserId)
    await assert.rejects(retargetUnverifiedEmail(db, h.adminUserId, h.hospitalId, 'again@fix.in'), /already verified/)
  } finally { restoreEnv() }
})
})
