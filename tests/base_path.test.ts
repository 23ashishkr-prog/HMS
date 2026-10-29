import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {baseBoot, basePath, publicOriginUrl, toRouterPath, withBase} from '../lib/basePath'
import {legacyRedirects, legacyRoots} from '../lib/legacyRedirects.mjs'
import {applySessionCookie, serializeLegacyClear, serializeSessionCookie, sessionCookieOptions} from '../lib/sessionCookie'

test('withBase prefixes root-relative paths once', () => {
  assert.equal(basePath, '/hms')
  assert.equal(withBase('/'), '/hms/dashboard')
  assert.equal(withBase('/hms'), '/hms/dashboard')
  assert.equal(withBase('/hms/'), '/hms/dashboard')
  assert.equal(withBase('/auth/login'), '/hms/auth/login')
  assert.equal(withBase('/api/auth/me'), '/hms/api/auth/me')
  assert.equal(withBase('/api/invoices/1/pdf?download=1'), '/hms/api/invoices/1/pdf?download=1')
  assert.equal(withBase('/hms/welcome'), '/hms/welcome')
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

test('router paths drop one /hms prefix so next/navigation does not double it', () => {
  assert.equal(toRouterPath('/hms/frontdesk'), '/frontdesk')
  assert.equal(toRouterPath('/hms'), '/dashboard')
  assert.equal(toRouterPath('/hms/'), '/dashboard')
  assert.equal(toRouterPath('/hms/platform/hospitals'), '/platform/hospitals')
  assert.equal(toRouterPath('/frontdesk'), '/frontdesk')
  assert.equal(toRouterPath('/'), '/dashboard')
  assert.equal(toRouterPath('https://greynova.in/hms'), 'https://greynova.in/hms')
})

test('old bookmarks redirect onto /hms without matching /hms itself', () => {
  const rules = legacyRedirects()
  const bySource = new Map(rules.map(r => [r.source, r]))
  for (const source of ['/platform', '/auth/login', '/welcome', '/api/auth/login', '/display']) {
    const exact = source.split('/').length === 2 ? bySource.get(source) : null
    const root = '/' + source.split('/')[1]
    const rule = exact || bySource.get(root + '/:path*')
    assert.ok(rule, source)
    assert.equal(rule.basePath, false)
    assert.equal(rule.permanent, false)
    assert.equal(rule.destination.startsWith('/hms/'), true)
  }
  assert.equal(bySource.get('/platform')?.destination, '/hms/platform')
  assert.equal(bySource.get('/auth/:path*')?.destination, '/hms/auth/:path*')
  assert.equal(bySource.get('/welcome')?.destination, '/hms/welcome')
  assert.equal(bySource.get('/favicon.ico')?.destination, '/hms/icon.svg')
  assert.ok(legacyRoots.includes('platform'))
  assert.ok(legacyRoots.includes('api'))
  assert.equal(rules.some(r => r.source === '/' || r.source.startsWith('/hms')), false)
  const src = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')
  assert.match(src, /legacyRedirects\(\)/)
  assert.match(src, /source: '\/', destination: '\/hms\/welcome', permanent: false, basePath: false/)
})

test('Next serves the app at /hms and does not offer the cross-origin embed', () => {
  const src = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')
  assert.match(src, /basePath:\s*'\/hms'/)
  assert.match(src, /frame-ancestors 'self'/)
  assert.match(src, /X-Frame-Options/)
  assert.match(src, /SAMEORIGIN/)
  assert.doesNotMatch(src, /frame-ancestors \*/)
  assert.doesNotMatch(src, /greynova\.in/)
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(layout, /icon:\s*'\/icon\.svg'/)
  assert.doesNotMatch(layout, /apple:\s*'\/apple-icon\.png'/)
  const crons = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(crons, /\/hms\/api\/cron\/lifecycle/)
  assert.match(crons, /\/hms\/api\/cron\/outbox/)
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /B='\/hms'/)
  assert.match(sw, /B\+'\/dashboard'/)
  assert.match(sw, /frontdesk/)
  assert.match(sw, /_next\/static/)
})

test('boot script maps bare / and /hms onto the dashboard', () => {
  const m = baseBoot.match(/function fix\(u\)\{([\s\S]*?)\}var of/)
  assert.ok(m, 'fix() present')
  const fix = new Function('u', "var B='/hms';var H=B+'/dashboard';" + m![1]) as (u: string) => string
  assert.equal(fix('/'), '/hms/dashboard')
  assert.equal(fix('/hms'), '/hms/dashboard')
  assert.equal(fix('/hms/'), '/hms/dashboard')
  assert.equal(fix('/hms?x=1'), '/hms/dashboard?x=1')
  assert.equal(fix('/auth/login'), '/hms/auth/login')
  assert.equal(fix('/hms/opd'), '/hms/opd')
  assert.equal(fix('/hms/dashboard'), '/hms/dashboard')
  assert.equal(fix('https://greynova.in/hms'), 'https://greynova.in/hms')
  assert.equal(fix('//greynova.in/hms'), '//greynova.in/hms')
  const auth = readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8')
  assert.match(auth, /admin:'\/dashboard'/)
  assert.doesNotMatch(auth, /admin:'\/'/)
})
