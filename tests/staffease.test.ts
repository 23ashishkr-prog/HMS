import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {LANGS, PHRASES, TOUR, translate} from '../lib/i18n'
import {NAV} from '../lib/nav'
import {cue, phoneHint, statusWord} from '../lib/phoneHint'

const JOBS = ['Add patient', 'Next patient', 'Next test', 'Next prescription', 'New bill', 'Ward rounds', "Today's summary"]

describe('plain language', () => {
  it('translates every menu name and the daily job into each language', () => {
    for (const n of NAV) assert.ok(PHRASES.includes(n.name), n.name)
    for (const label of JOBS) assert.ok(PHRASES.includes(label), label)
    for (const lang of LANGS) {
      if (lang.id === 'en') continue
      for (const phrase of [...NAV.map(n => n.name), ...JOBS]) {
        const out = translate(lang.id, phrase)
        assert.notEqual(out, phrase, lang.id + ' ' + phrase)
        assert.ok(out.length > 0)
      }
    }
  })
  it('fills in the step count', () => {
    assert.equal(translate('hi', 'Step {n} of {m}', {n: 1, m: 3}), 'चरण 1 / 3')
  })
  it('leaves an unknown phrase in English and never rewrites a patient name', () => {
    assert.equal(translate('hi', 'Sudipta Rao'), 'Sudipta Rao')
  })
})

describe('phone and colour cues', () => {
  it('warns when a number looks short or long', () => {
    assert.equal(phoneHint(''), null)
    assert.equal(phoneHint('98765'), 'Phone number looks short, please check')
    assert.equal(phoneHint('9876543210'), null)
    assert.equal(phoneHint('+91 98765 43210'), null)
    assert.equal(phoneHint('123456789012345'), 'Phone number looks long, please check')
  })
  it('uses the same three colours for a status', () => {
    assert.equal(cue('paid'), 'cue-done')
    assert.equal(cue('waiting'), 'cue-wait')
    assert.equal(cue('stat'), 'cue-attn')
    assert.equal(statusWord('sample_collected'), 'Sample taken')
    assert.equal(statusWord('dispensed'), 'Given')
  })
})

describe('first-login tour', () => {
  it('has 3 or 4 tips for every role, and every line is translated', () => {
    for (const role of ['admin', 'reception', 'doctor', 'nurse', 'lab', 'pharmacy', 'billing']) {
      const tips = TOUR[role]
      assert.ok(tips.length >= 3 && tips.length <= 4, role)
      for (const tip of tips) {
        assert.ok(PHRASES.includes(tip.title), tip.title)
        assert.ok(PHRASES.includes(tip.body), tip.body)
        assert.notEqual(translate('hi', tip.body), tip.body)
      }
    }
  })
})
