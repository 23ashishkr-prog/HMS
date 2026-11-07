/** Email verification for hospital sign-up and first staff sign-in.
 *  Same idea as TailDesk pet-owner registration: a 6-digit code on the same screen, hashed at rest,
 *  short expiry, resend cooldown, and a hard cap. Mail uses the same providers HMS already has
 *  (Resend, SMTP_URL, or the TailDesk mailbox saved in Platform settings). If none of those can send,
 *  verification stays off and sign-up is not blocked.
 */
import crypto from 'node:crypto'
import {Db, HttpError} from './core'
import {Provider} from './notify'
import {resendEmail, smtpEmail, appUrl} from './notify'
import {providersFor} from './integrations'
import {getTaildeskEmail} from './platformEmail'

const CODE_MINUTES = 10
const RESEND_SECONDS = 30
const MAX_PER_15_MIN = 5
const MAX_ATTEMPTS = 5
const MAX_PER_IP_HOUR = 20

export const EMAIL_VERIFICATION_ENV = ['RESEND_API_KEY', 'EMAIL_FROM'] as const
export const EMAIL_VERIFICATION_SMTP_ENV = ['SMTP_URL', 'EMAIL_FROM'] as const

const forcedOff = () => ['false', '0', 'off'].includes(String(process.env.EMAIL_VERIFICATION || '').trim().toLowerCase())

type Cache = {key: string; on: boolean; at: number}
let cache: Cache | null = null

export function resetEmailVerificationCache() { cache = null }

const envKey = (hospitalId?: string | null) => [forcedOff() ? '0' : '1', hospitalId || '', process.env.RESEND_API_KEY ? 'r' : '', process.env.EMAIL_FROM ? 'f' : '', process.env.SMTP_URL ? 's' : ''].join('|')

/** A sender, or null when nothing is configured. Never logs secrets. */
export async function mailSender(db: Db, hospitalId?: string | null, f: typeof fetch = fetch): Promise<Provider | null> {
  if (hospitalId) {
    try {
      const p = (await providersFor(db, hospitalId, f)).email
      if (p.configured()) return p
    } catch { /* fall through to the platform mailbox */ }
  } else if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return resendEmail(f)
  else if (process.env.SMTP_URL && process.env.EMAIL_FROM) return smtpEmail({smtpUrl: process.env.SMTP_URL, from: process.env.EMAIL_FROM})
  try {
    const c = await getTaildeskEmail(db)
    if (c.configured && c.fromEmail && c.host) return smtpEmail({smtpHost: c.host, smtpPort: String(c.port || 587), smtpUser: c.username, smtpPass: c.password, from: `HMS <${c.fromEmail}>`})
  } catch { /* mailbox not saved */ }
  return null
}

export async function emailVerificationActive(db: Db, hospitalId?: string | null) {
  if (forcedOff()) return false
  const key = envKey(hospitalId)
  if (cache && cache.key === key && Date.now() - cache.at < 30_000) return cache.on
  const on = !!(await mailSender(db, hospitalId))
  cache = {key, on, at: Date.now()}
  return on
}

export async function emailVerificationStatus(db: Db) {
  if (forcedOff()) return {emailVerification: false, provider: 'off' as const, missingEnv: [...EMAIL_VERIFICATION_ENV]}
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return {emailVerification: true, provider: 'resend' as const, missingEnv: [] as string[]}
  if (process.env.SMTP_URL && process.env.EMAIL_FROM) return {emailVerification: true, provider: 'smtp' as const, missingEnv: [] as string[]}
  try {
    const c = await getTaildeskEmail(db)
    if (c.configured) return {emailVerification: true, provider: 'platform' as const, missingEnv: [] as string[]}
  } catch { /* ignore */ }
  return {emailVerification: false, provider: 'off' as const, missingEnv: [...EMAIL_VERIFICATION_ENV]}
}

const sec = () => {
  const s = process.env.SESSION_SECRET
  if (!s) throw new HttpError(503, 'SESSION_SECRET not configured')
  return s
}
const hash = (userId: string, code: string) => crypto.createHmac('sha256', sec()).update(`email-otp:${userId}:${code}`).digest('hex')
const digits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

export type VerifyUser = {id: string; hospitalId?: string; hospital_id?: string; email: string; fullName?: string; full_name?: string}
const hid = (u: VerifyUser) => String(u.hospitalId || u.hospital_id || '')
const label = (u: VerifyUser) => String(u.fullName || u.full_name || 'there')

export async function markEmailVerified(db: Db, userId: string) {
  await db.query('update users set email_verified_at=coalesce(email_verified_at, now()) where id=$1', [userId])
}

/** Send a code. Throws 429 when the cooldown or the 15-minute cap is hit. */
export async function issueEmailCode(db: Db, user: VerifyUser, opts: {ip?: string; fetch?: typeof fetch; force?: boolean} = {}) {
  const hospitalId = hid(user)
  const sender = await mailSender(db, hospitalId || null, opts.fetch)
  if (!sender) throw new HttpError(503, 'E-mail is not configured.')
  const recent = (await db.query("select created_at from email_otps where user_id=$1 order by created_at desc limit 1", [user.id])).rows[0]
  if (recent && !opts.force) {
    const wait = RESEND_SECONDS * 1000 - (Date.now() - new Date(recent.created_at).getTime())
    if (wait > 0) throw new HttpError(429, 'Please wait before requesting another code.', {resendIn: Math.ceil(wait / 1000), cooldown: true})
  }
  const n = Number((await db.query("select count(*)::int n from email_otps where user_id=$1 and created_at>now()-interval '15 minutes'", [user.id])).rows[0].n)
  if (n >= MAX_PER_15_MIN) throw new HttpError(429, 'Too many codes. Please wait 15 minutes and try again.', {resendIn: 15 * 60})
  const ip = String(opts.ip || '').slice(0, 60)
  if (ip) {
    const hits = Number((await db.query("select count(*)::int n from email_otps where ip=$1 and created_at>now()-interval '1 hour'", [ip])).rows[0].n)
    if (hits >= MAX_PER_IP_HOUR) throw new HttpError(429, 'Too many codes from this network. Please wait an hour and try again.', {resendIn: 60 * 60})
  }
  const code = digits()
  await db.query('update email_otps set used_at=now() where user_id=$1 and used_at is null', [user.id])
  await db.query("insert into email_otps(hospital_id,user_id,email,code_hash,purpose,expires_at,ip) values($1,$2,$3,$4,'verify',now()+interval '10 minutes',$5)", [hospitalId, user.id, user.email, hash(user.id, code), ip || null])
  const body = `Hi ${label(user)},\n\nYour HMS verification code is ${code}.\n\nIt expires in ${CODE_MINUTES} minutes. Enter it on the same screen to continue.\n\nIf you did not ask for this, you can ignore this email.`
  await sender.send({channel: 'email', to: user.email, subject: 'Your HMS verification code', body})
  return {resendIn: RESEND_SECONDS}
}

export async function verifyEmailCode(db: Db, userId: string, raw: unknown) {
  const code = String(raw || '').replace(/\D/g, '')
  if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code.')
  const o = (await db.query('select * from email_otps where user_id=$1 and used_at is null and expires_at>now() order by created_at desc limit 1', [userId])).rows[0]
  if (!o) throw new HttpError(400, 'Code expired. Request a new one.')
  if (o.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong codes. Request a new one.')
  await db.query('update email_otps set attempts=attempts+1 where id=$1', [o.id])
  const a = Buffer.from(String(o.code_hash)), b = Buffer.from(hash(userId, code))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(400, 'Wrong code. Please check and try again.')
  await db.query('update email_otps set used_at=now() where id=$1', [o.id])
  await db.query('update users set email_verified_at=now(), updated_at=now() where id=$1', [userId])
  await db.query("insert into audit_log(hospital_id,user_id,action,entity,entity_id) values($1,$2,'email_verified','user',$2::text)", [o.hospital_id, userId]).catch(() => {})
  return {ok: true}
}

/** Point an unverified account at a corrected address and keep the one-trial claim on this hospital. */
export async function retargetUnverifiedEmail(db: Db, userId: string, hospitalId: string, next: unknown) {
  const email = String(next || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Email is invalid.')
  const cur = (await db.query('select email, email_verified_at from users where id=$1 and hospital_id=$2', [userId, hospitalId])).rows[0]
  if (!cur) throw new HttpError(404, 'User not found.')
  if (cur.email_verified_at) throw new HttpError(400, 'This email is already verified.')
  if (email === String(cur.email).toLowerCase()) return cur.email as string
  const dup = (await db.query('select 1 from users where hospital_id=$1 and lower(email)=$2 and id<>$3', [hospitalId, email, userId])).rows[0]
  if (dup) throw new HttpError(409, 'A user with that email already exists in this hospital.')
  const clash = (await db.query("select 1 from trial_claims where kind='email' and norm=$1 and hospital_id<>$2 and blocked", [email, hospitalId])).rows[0]
  if (clash) throw new HttpError(409, 'That email already started a trial. Sign in, or use another email.')
  await db.query("update trial_claims set norm=$3 where hospital_id=$1 and kind='email' and norm=$2", [hospitalId, String(cur.email).toLowerCase(), email])
  await db.query('update users set email=$2, updated_at=now() where id=$1', [userId, email])
  await db.query('update hospitals set contact_email=$2, updated_at=now() where id=$1 and lower(contact_email)=lower($3)', [hospitalId, email, cur.email])
  return email
}

/** After a user row exists (default verified). Nulls the timestamp only when a code was actually sent. */
export async function applyNewUserVerification(db: Db, user: VerifyUser, f?: typeof fetch): Promise<'sent' | 'skipped' | 'off'> {
  if (!(await emailVerificationActive(db, hid(user) || null))) return 'off'
  try {
    await issueEmailCode(db, user, {fetch: f})
    await db.query('update users set email_verified_at=null where id=$1', [user.id])
    return 'sent'
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw e
    return 'skipped'
  }
}

export async function sendWorkspaceReady(db: Db, hospitalId: string, to: string, code: string, f?: typeof fetch) {
  const sender = await mailSender(db, hospitalId, f)
  if (!sender) return
  await sender.send({channel: 'email', to, subject: 'Your hospital workspace is ready · code ' + code, body: `Welcome to HMS.\n\nHospital code: ${code}\nSign in: ${appUrl()}/auth/login\n\nYour staff use the same hospital code to sign in.`})
}
