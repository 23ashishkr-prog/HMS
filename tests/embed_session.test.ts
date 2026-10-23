import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stringifyCookie} from 'next/dist/compiled/@edge-runtime/cookies/index.js'
import {requestsEmbedCookie, sessionCookieOptions} from '../lib/sessionCookie'
import {isWebKitBrowser} from '../lib/embedSession'

test('production embed cookie is SameSite=None, Secure, and Partitioned', () => {
  const embed = sessionCookieOptions(43200, {embed: true, nodeEnv: 'production'})
  assert.equal(embed.sameSite, 'none')
  assert.equal(embed.secure, true)
  assert.equal(embed.partitioned, true)
  assert.equal(embed.httpOnly, true)
  assert.equal(embed.path, '/')
  assert.equal(embed.maxAge, 43200)
  const wire = stringifyCookie({name: 'hms_session', value: 'tok', ...embed})
  assert.match(wire, /SameSite=none/)
  assert.match(wire, /Secure/)
  assert.match(wire, /HttpOnly/)
  assert.match(wire, /Partitioned/)
  assert.doesNotMatch(wire, /Domain=/)
})

test('direct visits stay first-party (hospital Lax, platform Strict)', () => {
  const hospital = sessionCookieOptions(43200, {embed: false, nodeEnv: 'production'})
  assert.equal(hospital.sameSite, 'lax')
  assert.equal(hospital.partitioned, false)
  assert.equal(hospital.secure, true)
  const platform = sessionCookieOptions(28800, {embed: false, sameSite: 'strict', nodeEnv: 'production'})
  assert.equal(platform.sameSite, 'strict')
  assert.equal(platform.partitioned, false)
  // Dev cannot set Secure/None cookies on http://localhost.
  const dev = sessionCookieOptions(43200, {embed: true, nodeEnv: 'development'})
  assert.equal(dev.sameSite, 'lax')
  assert.equal(dev.secure, false)
  assert.equal(dev.partitioned, false)
})

test('embed cookie is requested only by the explicit header', () => {
  assert.equal(requestsEmbedCookie(new Request('https://hms.example/api/auth/login', {headers: {'x-hms-embed': '1'}})), true)
  assert.equal(requestsEmbedCookie(new Request('https://hms.example/api/auth/login')), false)
  assert.equal(requestsEmbedCookie(new Request('https://hms.example/api/auth/login', {headers: {'x-hms-embed': 'true'}})), false)
  assert.equal(requestsEmbedCookie(undefined), false)
})

test('WebKit (including iOS browsers) needs storage access; Chromium does not', () => {
  assert.equal(isWebKitBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'), false)
  assert.equal(isWebKitBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'MacIntel', 5), false)
  assert.equal(isWebKitBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), true)
  assert.equal(isWebKitBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1'), true)
  assert.equal(isWebKitBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'), false)
  assert.equal(isWebKitBrowser('', 'MacIntel', 5), true)
})

test('only greynova.in may frame HMS', () => {
  const src = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')
  assert.match(src, /frame-ancestors 'self' https:\/\/greynova\.in https:\/\/www\.greynova\.in/)
  assert.doesNotMatch(src, /key:\s*'X-Frame-Options'/)
  assert.doesNotMatch(src, /frame-ancestors \*/)
})
