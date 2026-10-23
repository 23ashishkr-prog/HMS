import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAppPath} from '../lib/safeRedirect'

test('safeAppPath allows relative app paths only',()=>{
  assert.equal(safeAppPath('/'),'/')
  assert.equal(safeAppPath('/admin/users'),'/admin/users')
  assert.equal(safeAppPath('https://greynova.in/hms/'),'/')
  assert.equal(safeAppPath('//greynova.in/hms'),'/')
  assert.equal(safeAppPath('https://evil.example/'),'/')
  assert.equal(safeAppPath('/\\evil'),'/')
  assert.equal(safeAppPath(null as any,'/opd'),'/opd')
  assert.equal(safeAppPath('  /frontdesk  '), '/frontdesk')
})
