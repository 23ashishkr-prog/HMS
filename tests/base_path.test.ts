import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {basePath, publicOriginUrl, withBase} from '../lib/basePath'
import {applySessionCookie, serializeLegacyClear, serializeSessionCookie, sessionCookieOptions} from '../lib/sessionCookie'

test('withBase prefixes root-relative paths once', () => {
  assert.equal(basePath, '/hms')
  assert.equal(withBase('/'), '/hms')
  assert.equal(withBase('/auth/login'), '/hms/auth/login')
  assert.equal(withBase('/api/auth/me'), '/hms/api/auth/me')
  assert.equal(withBase('/api/invoices/1/pdf?download=1'), '/hms/api/invoices/1/pdf?download=1')
  assert.equal(withBase('/hms/welcome'), '/hms/welcome')
  assert.equal(withBase('/hms'), '/hms')
  assert.equal(withBase('https://greynova.in/hms/'), 'https://greynova.in/hms/')
  assert.equal(withBase('//greynova.in/hms'), '//greynova.in/hms')
  assert.equal(withBase('#pricing'), '#pricing')
  assert.equal(withBase('welcome'), 'welcome')
})

test('public links include /hms and do not double it', () => {
  const prev = process.env.APP_BASE_URL
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
  try {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    process.env.APP_BASE_URL = 'https://hms.example'
    assert.equal(publicOriginUrl(), 'https://hms.example/hms')
    process.env.APP_BASE_URL = 'https://hms.example/hms'
    assert.equal(publicOriginUrl(), 'https://hms.example/hms')
    process.env.APP_BASE_URL = 'https://greynova.in/'
    assert.equal(publicOriginUrl(), 'https://greynova.in/hms')
  } finally {
    if (prev === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = prev
    if (prod === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prod
  }
})

test('session cookies are first-party and scoped to /hms', () => {
  const hospital = sessionCookieOptions(43200, {nodeEnv: 'production'})
  assert.equal(hospital.sameSite, 'lax')
  assert.equal(hospital.secure, true)
  assert.equal(hospital.httpOnly, true)
  assert.equal(hospital.path, '/hms')
  assert.equal(hospital.maxAge, 43200)
  assert.equal('partitioned' in hospital, false)
  const platform = sessionCookieOptions(28800, {sameSite: 'strict', nodeEnv: 'production'})
  assert.equal(platform.sameSite, 'strict')
  assert.equal(platform.path, '/hms')
  const dev = sessionCookieOptions(43200, {nodeEnv: 'development'})
  assert.equal(dev.secure, false)
  assert.equal(dev.sameSite, 'lax')
  const wire = serializeSessionCookie('hms_session', 'tok', 43200, 'lax', 'production')
  assert.match(wire, /Path=\/hms/)
  assert.match(wire, /SameSite=lax/)
  assert.match(wire, /Secure/)
  assert.match(wire, /HttpOnly/)
  assert.doesNotMatch(wire, /Partitioned/)
  assert.doesNotMatch(wire, /SameSite=none/i)
  assert.doesNotMatch(wire, /Domain=/)
  const legacy = serializeLegacyClear('hms_session', 'lax', 'production')
  assert.match(legacy, /Path=\//)
  assert.match(legacy, /Max-Age=0/)
  assert.doesNotMatch(legacy, /Path=\/hms/)
})

test('login response sets Path=/hms and clears the legacy Path=/ cookie', () => {
  const res = new Response(null)
  applySessionCookie(res, 'hms_session', 'tok', 43200, 'lax')
  const all = res.headers.getSetCookie()
  assert.equal(all.length, 2)
  assert.match(all[0], /hms_session=tok/)
  assert.match(all[0], /Path=\/hms/)
  assert.match(all[1], /Path=\//)
  assert.match(all[1], /Max-Age=0/)
  assert.doesNotMatch(all[1], /Path=\/hms/)
})

test('Next serves the app at /hms and does not offer the cross-origin embed', () => {
  const src = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')
  assert.match(src, /basePath:\s*'\/hms'/)
  assert.match(src, /frame-ancestors 'self'/)
  assert.match(src, /X-Frame-Options/)
  assert.match(src, /SAMEORIGIN/)
  assert.doesNotMatch(src, /frame-ancestors \*/)
  assert.doesNotMatch(src, /greynova\.in/)
  const crons = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(crons, /\/hms\/api\/cron\/lifecycle/)
  assert.match(crons, /\/hms\/api\/cron\/outbox/)
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /B='\/hms'/)
  assert.match(sw, /frontdesk/)
  assert.match(sw, /_next\/static/)
})
