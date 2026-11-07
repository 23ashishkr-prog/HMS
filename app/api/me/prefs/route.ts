import {NextResponse} from 'next/server'
import {getSession} from '@/lib/auth'
import {getDb} from '@/lib/db'
import {isLang} from '@/lib/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Remember language and whether this person has seen the first-login tips. */
export async function PATCH(req: Request) {
  const s = await getSession()
  if (!s) return NextResponse.json({error: 'Unauthenticated'}, {status: 401})
  const body = await req.json().catch(() => ({}))
  const db = getDb()
  if (body.locale != null) {
    if (!isLang(body.locale)) return NextResponse.json({error: 'Choose a language from the list.'}, {status: 400})
    await db.query('update users set locale=$1, updated_at=now() where id=$2 and hospital_id=$3', [body.locale, s.userId, s.hospitalId])
  }
  if (body.tourSeen === true) await db.query('update users set tour_seen_at=now(), updated_at=now() where id=$1 and hospital_id=$2', [s.userId, s.hospitalId])
  if (body.tourSeen === false) await db.query('update users set tour_seen_at=null, updated_at=now() where id=$1 and hospital_id=$2', [s.userId, s.hospitalId])
  return NextResponse.json({ok: true})
}
