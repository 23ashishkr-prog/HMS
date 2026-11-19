import {test} from 'node:test'
import assert from 'node:assert/strict'
import {convertInr,currencyForCountry,FALLBACK_PER_INR,fxParamFromSearch,hrefWithFx,resolveDisplay} from '../lib/fx'
import {planAmountInr} from '../lib/services/razorpay'
import {PLAN_ANNUAL_INR,PLAN_PRICE_INR} from '../lib/plans'

test('display currency: query, country, geo, then USD',()=>{
 assert.deepEqual(resolveDisplay({currency:'gbp',country:'DE',geo:'US'}),{currency:'GBP',via:'currency',country:null})
 assert.deepEqual(resolveDisplay({currency:'INR',country:'DE'}),{currency:'EUR',via:'country',country:'DE'})
 assert.equal(resolveDisplay({country:'GB'}).currency,'GBP')
 assert.equal(resolveDisplay({country:'uk'}).currency,'GBP')
 assert.equal(resolveDisplay({country:'fr'}).currency,'EUR')
 assert.equal(resolveDisplay({country:'IN'}).currency,'USD')
 assert.deepEqual(resolveDisplay({geo:'DE'}),{currency:'EUR',via:'geo',country:'DE'})
 assert.deepEqual(resolveDisplay({}),{currency:'USD',via:'default',country:null})
 assert.equal(currencyForCountry('NO'),'EUR')
 assert.equal(currencyForCountry('US'),'USD')
})

test('fx query is kept on the onboarding plan link',()=>{
 assert.equal(fxParamFromSearch('?plan=basic&country=de'),'country=DE')
 assert.equal(fxParamFromSearch('currency=usd'),'currency=USD')
 assert.equal(fxParamFromSearch('?plan=clinic'),null)
 assert.equal(hrefWithFx('/onboarding?plan=clinic','country=GB'),'/onboarding?plan=clinic&country=GB')
 assert.equal(hrefWithFx('/welcome#pricing','currency=EUR'),'/welcome?currency=EUR#pricing')
 assert.equal(hrefWithFx('/onboarding?plan=basic&country=FR','country=GB'),'/onboarding?plan=basic&country=FR')
})

test('conversion never invents a number when the rate is missing, and does not change the INR charge',()=>{
 assert.equal(convertInr(19999,null),null)
 assert.equal(convertInr(19999,0),null)
 assert.ok(Math.abs((convertInr(19999,FALLBACK_PER_INR.GBP)??0)-19999/123)<0.001)
 assert.equal(planAmountInr('basic','monthly'),PLAN_PRICE_INR.basic)
 assert.equal(planAmountInr('basic','annual'),PLAN_ANNUAL_INR.basic)
 assert.equal(planAmountInr('clinic','monthly'),1989)
 assert.equal(planAmountInr('basic','monthly'),19999)
 assert.equal(planAmountInr('engage_support','monthly'),89700)
 assert.equal(planAmountInr('ai_engage','annual'),499990)
})
