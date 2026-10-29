import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAppPath} from '../lib/safeRedirect'

test('safeAppPath allows relative app paths and never returns the bare app root',()=>{
  assert.equal(safeAppPath('/'),'/dashboard')
  assert.equal(safeAppPath('/hms'),'/dashboard')
  assert.equal(safeAppPath('/hms/'),'/dashboard')
  assert.equal(safeAppPath('/hms/opd'),'/opd')
  assert.equal(safeAppPath('/admin/users'),'/admin/users')
  assert.equal(safeAppPath('https://greynova.in/hms/'),'/dashboard')
  assert.equal(safeAppPath('//greynova.in/hms'),'/dashboard')
  assert.equal(safeAppPath('https://evil.example/'),'/dashboard')
  assert.equal(safeAppPath('/\\evil'),'/dashboard')
  assert.equal(safeAppPath(null as any,'/opd'),'/opd')
  assert.equal(safeAppPath('  /frontdesk  '), '/frontdesk')
})
