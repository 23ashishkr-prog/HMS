import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mailboxFrom, smtpTransportConfig} from '../lib/services/notify'

test('HMS and TailDesk share an address and keep their own display names', () => {
  assert.equal(mailboxFrom('HMS', 'info@greynova.in'), 'HMS <info@greynova.in>')
  assert.equal(mailboxFrom('TailDesk', 'info@greynova.in'), 'TailDesk <info@greynova.in>')
  assert.equal(mailboxFrom('Bad <name>', 'info@greynova.in'), 'Bad name <info@greynova.in>')
})

test('Gmail on 587 uses STARTTLS, and a spaced app password is joined', () => {
  const built = smtpTransportConfig({smtpHost: 'smtp.gmail.com', smtpPort: '587', smtpUser: 'info@greynova.in', smtpPass: 'abcd efgh ijkl mnop', from: 'HMS <info@greynova.in>'})
  const t = built.transport as any
  assert.equal(t.port, 587)
  assert.equal(t.secure, false)
  assert.equal(t.requireTLS, true)
  assert.equal(t.tls.minVersion, 'TLSv1.2')
  assert.equal(t.auth.pass, 'abcdefghijklmnop')
  assert.equal(built.summary.passHadSpace, true)
  assert.equal(built.summary.passLen, 16)
  assert.equal(JSON.stringify(built.summary).includes('abcdefgh'), false)
})

test('port 25 is sent on 587, and 465 stays implicit TLS', () => {
  const plain = smtpTransportConfig({smtpHost: 'smtp.example.com', smtpPort: '25', smtpUser: 'a', smtpPass: 'secret-value'})
  assert.equal((plain.transport as any).port, 587)
  assert.equal(plain.summary.remappedPort25, true)
  assert.equal(JSON.stringify(plain.summary).includes('secret-value'), false)
  const ssl = smtpTransportConfig({smtpHost: 'smtp.example.com', smtpPort: '465', smtpUser: 'a', smtpPass: 'x'})
  assert.equal((ssl.transport as any).secure, true)
  assert.equal((ssl.transport as any).requireTLS, false)
})
