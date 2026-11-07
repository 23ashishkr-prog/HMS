import {NextResponse} from 'next/server'
import {getDb} from '@/lib/db'
import {fail, body} from '@/lib/api'
import {authenticate} from '@/lib/services/auth'
import {Db} from '@/lib/services/core'
import {issueEmailCode, markEmailVerified, retargetUnverifiedEmail} from '@/lib/services/emailverify'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Resend the 6-digit code, or send it to a corrected address, for an account that is not verified yet. */
export async function POST(req: Request) {
  try {
    const b = await body(req)
    const db = getDb() as unknown as Db
    const u = await authenticate(db, b.email, b.password, b.hospitalCode, {allowUnverified: true})
    if (u.email_verified_at) return NextResponse.json({ok: true, alreadyVerified: true})
    const next = String(b.nextEmail || '').trim().toLowerCase()
    const email = next && next !== String(u.email).toLowerCase() ? await retargetUnverifiedEmail(db, u.id, u.hospital_id, next) : u.email
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60)
    try {
      const sent = await issueEmailCode(db, {id: u.id, hospitalId: u.hospital_id, email, fullName: u.full_name}, {ip, force: email !== u.email})
      return NextResponse.json({ok: true, email, resendIn: sent.resendIn})
    } catch (e: any) {
      if (e?.status === 429 && e?.extra?.cooldown) return NextResponse.json({ok: true, email, resendIn: e.extra.resendIn})
      if (e?.status === 429) throw e
      await markEmailVerified(db, u.id)
      return NextResponse.json({ok: true, skipped: true, email})
    }
  } catch (e: any) {
    if (e?.needHospitalCode) return NextResponse.json({error: e.message, needHospitalCode: true}, {status: 409})
    return fail(e)
  }
}
