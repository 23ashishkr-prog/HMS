import {test} from 'node:test'
import assert from 'node:assert/strict'
import {TERMS_CLAUSES,TERMS_TITLE,TERMS_VERSION,assertTermsAgreed} from '../lib/terms'

test('refund terms stay the approved wording and payment requires agreement',()=>{
 assert.equal(TERMS_VERSION,'2026-11-19')
 assert.equal(TERMS_CLAUSES.length,12)
 assert.match(TERMS_CLAUSES[0],/One trial per organisation/)
 assert.match(TERMS_CLAUSES[1],/30-day money-back guarantee/)
 assert.match(TERMS_CLAUSES[6],/after 7 days the account may be limited to read-only/)
 assert.match(TERMS_TITLE,/GREYNOVA TECH SOLUTIONS PRIVATE LIMITED/)
 assert.match(TERMS_CLAUSES[11],/GREYNOVA TECH SOLUTIONS PRIVATE LIMITED, CIN U63990JH2026PTC029571/)
 assert.equal((TERMS_TITLE+TERMS_CLAUSES.join('\n')).includes('GreyNova Private Limited'),false)
 assert.throws(()=>assertTermsAgreed({}),/Agree to the Terms and Refund policy/)
 assert.equal(assertTermsAgreed({termsAgreed:true}).version,'2026-11-19')
})
