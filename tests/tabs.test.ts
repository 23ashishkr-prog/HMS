import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {tabValue, withTab} from '../lib/tabs'

describe('shared tab URL', () => {
  it('drops the param on the first tab and keeps the rest', () => {
    assert.equal(withTab('patient=abc&tab=visits', 'tab', 'overview', 'overview'), '?patient=abc')
    assert.equal(withTab('patient=abc', 'tab', 'labs', 'overview'), '?patient=abc&tab=labs')
  })
  it('reads a known tab and falls back otherwise', () => {
    assert.equal(tabValue('tab=stock', 'tab', ['rx', 'stock', 'reorder'], 'rx'), 'stock')
    assert.equal(tabValue('tab=nope', 'tab', ['rx', 'stock'], 'rx'), 'rx')
    assert.equal(tabValue('', 'view', ['mine', 'all'], 'mine'), 'mine')
  })
})
