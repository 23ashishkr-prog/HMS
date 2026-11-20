import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {partnerFromRequest} from '../lib/services/partnerKeys'

const req=(h:Record<string,string>)=>new Request('https://x.test/api/platform/v1/email',{headers:h})
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('each product is recognised only by its own shared key',()=>{
  const prev={td:process.env.TAILDESK_PLATFORM_API_KEY,ss:process.env.SMARTSHOP_PLATFORM_API_KEY}
  process.env.TAILDESK_PLATFORM_API_KEY='td_key_0123456789abcdef';process.env.SMARTSHOP_PLATFORM_API_KEY='ss_key_0123456789abcdef'
  try{
    assert.equal(partnerFromRequest(req({authorization:'Bearer td_key_0123456789abcdef'})),'taildesk')
    assert.equal(partnerFromRequest(req({authorization:'Bearer ss_key_0123456789abcdef'})),'smartshop')
    assert.equal(partnerFromRequest(req({'x-platform-api-key':'ss_key_0123456789abcdef'})),'smartshop')
    assert.equal(partnerFromRequest(req({authorization:'Bearer nope'})),null)
    assert.equal(partnerFromRequest(req({})),null)
  }finally{
    if(prev.td===undefined)delete process.env.TAILDESK_PLATFORM_API_KEY;else process.env.TAILDESK_PLATFORM_API_KEY=prev.td
    if(prev.ss===undefined)delete process.env.SMARTSHOP_PLATFORM_API_KEY;else process.env.SMARTSHOP_PLATFORM_API_KEY=prev.ss
  }
})

test('an unset key never matches (empty bearer cannot pass)',()=>{
  const prev={td:process.env.TAILDESK_PLATFORM_API_KEY,ss:process.env.SMARTSHOP_PLATFORM_API_KEY}
  delete process.env.TAILDESK_PLATFORM_API_KEY;delete process.env.SMARTSHOP_PLATFORM_API_KEY
  try{assert.equal(partnerFromRequest(req({authorization:'Bearer '})),null);assert.equal(partnerFromRequest(req({authorization:'Bearer anything'})),null)}
  finally{
    if(prev.td!==undefined)process.env.TAILDESK_PLATFORM_API_KEY=prev.td
    if(prev.ss!==undefined)process.env.SMARTSHOP_PLATFORM_API_KEY=prev.ss
  }
})

test('both endpoints require a partner key, return no-store, and the mailbox is labelled per product',()=>{
  for(const p of ['app/api/platform/v1/email/route.ts','app/api/platform/v1/razorpay/route.ts']){
    const s=read(p)
    assert.match(s,/partnerFromRequest/);assert.match(s,/status:401/);assert.match(s,/\{configured:false\}/)
  }
  assert.match(read('app/api/platform/v1/email/route.ts'),/no-store/)
  assert.match(read('app/api/platform/v1/razorpay/route.ts'),/no-store/)
  assert.match(read('app/api/platform/v1/email/route.ts'),/'Smart Shop'/)
  assert.doesNotMatch(read('app/api/platform/v1/razorpay/route.ts'),/req\.json|searchParams/)
})
