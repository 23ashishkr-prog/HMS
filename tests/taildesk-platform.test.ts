import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {freshDb,tenant} from './helpers'
import {activatePaidPlan,platformListEvents,platformPaymentStats} from '../lib/services/tenancy'
import {platformConvertPaid} from '../lib/services/lifecycle'
import {
  collectEvents,filterTenants,isTailDeskProduct,normalizePayment,normalizeTenant,rollupPayments,statsFromTenants,taildeskConfigured,taildeskCreds,taildeskHospitalDetail,taildeskHospitalList,taildeskPayments,
} from '../lib/services/taildesk'

const SECRET='td_live_secret_key'

function samplePayload(){
  return {
    tenants:{
      tenants:[{
        id:'ten_1', name:'Paws Clinic', code:'PAWS', status:'active', created_at:'2026-01-01T00:00:00Z',
        admin:{name:'Ada', email:'ada@paws.test', phone:'+9198'},
        subscription:{plan_code:'core', plan_name:'Core', status:'trialing', trial_ends_at:'2026-12-01T00:00:00Z', currency:'INR', amount:1499, amount_in_inr:1499},
      },{
        id:'ten_2', businessName:'Hydro Pups', slug:'HYDRO', subscriptionStatus:'active',
        plan:{code:'ultimate', name:'Ultimate'}, currency:'USD', amount:49, amountInInr:4100,
        currentPeriodEnd:'2027-01-01T00:00:00Z',
      }],
    },
    subscriptions:{
      subscriptions:[{
        id:'sub_2', tenantId:'ten_2', tenantName:'Hydro Pups', tenantCode:'HYDRO',
        planCode:'ultimate', planName:'Ultimate', status:'active', billingPeriod:'monthly',
        currency:'USD', amount:49, amount_in_inr:4100,
        current_period_end:'2027-01-01T00:00:00Z', provider:'stripe',
      }],
      events:[{
        id:'ev_1', tenant_id:'ten_2', tenant_name:'Hydro Pups', event_type:'subscription.charged',
        provider:'stripe', received_at:'2026-06-01T00:00:00Z', currency:'USD', amount:49, amount_in_inr:4100,
        secret:'should-not-matter',
      }],
    },
    revenue:{
      total_amount_in_inr:5599,
      by_currency:[
        {currency:'INR', amount:1499, amount_in_inr:1499},
        {currency:'USD', amount:49, amount_in_inr:4100},
      ],
      payments:[
        {id:'pay_in', tenant_id:'ten_1', tenant_name:'Paws Clinic', tenant_code:'PAWS', plan_code:'core', billing_period:'monthly', currency:'INR', amount:1499, amount_in_inr:1499, status:'paid', paid_at:'2026-05-01T00:00:00Z'},
        {id:'pay_us', tenant_id:'ten_2', tenant_name:'Hydro Pups', tenant_code:'HYDRO', plan_code:'ultimate', billing_period:'monthly', currency:'USD', amount:49, amount_in_inr:4100, status:'succeeded', paid_at:'2026-06-01T00:00:00Z'},
      ],
    },
  }
}

function mockFetch(bodies=samplePayload(), status=200){
  const calls:string[]=[]
  const orig=globalThis.fetch
  globalThis.fetch=async(input:any,init?:any)=>{
    const url=String(input)
    calls.push(url)
    const headers=new Headers(init?.headers||{})
    assert.equal(headers.get('authorization'), 'Bearer '+SECRET)
    assert.equal(headers.get('x-platform-api-key'), SECRET)
    assert.equal(init?.method||'GET','GET')
    let body:any=bodies.tenants
    if(url.includes('/subscriptions'))body=bodies.subscriptions
    else if(url.includes('/revenue'))body=bodies.revenue
    return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
  }
  return {calls, restore(){globalThis.fetch=orig}}
}

test('product switch only treats taildesk as the external product',()=>{
  assert.equal(isTailDeskProduct('taildesk'),true)
  assert.equal(isTailDeskProduct(' TailDesk '),true)
  assert.equal(isTailDeskProduct('hms'),false)
  assert.equal(isTailDeskProduct(null),false)
  assert.equal(isTailDeskProduct(''),false)
})

test('missing or invalid TailDesk env is not configured and does not call the network',async()=>{
  const prev={url:process.env.TAILDESK_API_URL,key:process.env.TAILDESK_PLATFORM_API_KEY}
  delete process.env.TAILDESK_API_URL
  delete process.env.TAILDESK_PLATFORM_API_KEY
  assert.equal(taildeskConfigured(),false)
  let called=false
  const orig=globalThis.fetch
  globalThis.fetch=async()=>{called=true;throw new Error('should not fetch')}
  const view=await taildeskHospitalList(new URLSearchParams())
  assert.equal(view.configured,false)
  assert.match(String(view.message),/not configured/i)
  assert.match(String(view.message),/TAILDESK_API_URL/)
  assert.match(String(view.message),/TAILDESK_PLATFORM_API_KEY/)
  assert.equal(called,false)
  process.env.TAILDESK_API_URL='file:///tmp/taildesk'
  process.env.TAILDESK_PLATFORM_API_KEY=SECRET
  assert.equal(taildeskCreds(),null)
  process.env.TAILDESK_API_URL='https://user:pass@taildesk.example'
  assert.equal(taildeskCreds(),null)
  globalThis.fetch=orig
  if(prev.url)process.env.TAILDESK_API_URL=prev.url; else delete process.env.TAILDESK_API_URL
  if(prev.key)process.env.TAILDESK_PLATFORM_API_KEY=prev.key; else delete process.env.TAILDESK_PLATFORM_API_KEY
})

test('TailDesk tenants, subscriptions, events and multi-currency revenue match the platform views',async()=>{
  const prev={url:process.env.TAILDESK_API_URL,key:process.env.TAILDESK_PLATFORM_API_KEY}
  process.env.TAILDESK_API_URL='https://taildesk.example/base/'
  process.env.TAILDESK_PLATFORM_API_KEY=SECRET
  const mock=mockFetch()
  try{
    const list=await taildeskHospitalList(new URLSearchParams())
    assert.equal(list.configured,true)
    assert.equal(list.hospitals.length,2)
    const paws=list.hospitals.find(h=>h.id==='ten_1')!
    assert.equal(paws.plan_code,'core')
    assert.equal(paws.sub_status,'trialing')
    assert.equal(paws.admin_email,'ada@paws.test')
    assert.equal(paws.trial_ends_at,'2026-12-01T00:00:00Z')
    const hydro=list.hospitals.find(h=>h.id==='ten_2')!
    assert.equal(hydro.currency,'USD')
    assert.equal(hydro.amount,49)
    assert.equal(hydro.amount_in_inr,4100)
    assert.equal(hydro.plan_name,'Ultimate')
    assert.equal(list.stats.trial,1)
    assert.equal(list.stats.active,1)
    assert.equal(list.revenue.paid_inr,5599)
    assert.deepEqual(list.revenue.by_currency.map(c=>c.currency),['INR','USD'])
    assert.equal(list.events[0].event_type,'subscription.charged')
    assert.equal(JSON.stringify(list).includes(SECRET),false)
    assert.ok(mock.calls.some(u=>u.startsWith('https://taildesk.example/base/api/platform/v1/tenants')))
    const filtered=await taildeskHospitalList(new URLSearchParams('status=trialing&q=paws'))
    assert.deepEqual(filtered.hospitals.map(h=>h.id),['ten_1'])
    const pay=await taildeskPayments(new URLSearchParams())
    assert.equal(pay.payments.length,2)
    assert.equal(pay.payments.find(p=>p.id==='pay_us')!.status,'captured')
    assert.equal(pay.stats.paid_inr,5599)
    const one=await taildeskHospitalDetail('ten_2')
    assert.equal(one.hospital!.name,'Hydro Pups')
    assert.equal(one.payments.length,1)
    assert.equal(one.events[0].amount_in_inr,4100)
  }finally{
    mock.restore()
    if(prev.url)process.env.TAILDESK_API_URL=prev.url; else delete process.env.TAILDESK_API_URL
    if(prev.key)process.env.TAILDESK_PLATFORM_API_KEY=prev.key; else delete process.env.TAILDESK_PLATFORM_API_KEY
  }
})

test('upstream failures stay on the TailDesk view and never echo the API key',async()=>{
  const prev={url:process.env.TAILDESK_API_URL,key:process.env.TAILDESK_PLATFORM_API_KEY}
  process.env.TAILDESK_API_URL='https://taildesk.example'
  process.env.TAILDESK_PLATFORM_API_KEY=SECRET
  const orig=globalThis.fetch
  globalThis.fetch=async()=>{throw new Error('connect '+SECRET)}
  try{
    const view=await taildeskHospitalList(new URLSearchParams())
    assert.equal(view.configured,true)
    assert.equal(view.hospitals.length,0)
    assert.match(String(view.upstreamError),/connect/)
    assert.equal(String(view.upstreamError).includes(SECRET),false)
  }finally{
    globalThis.fetch=orig
    if(prev.url)process.env.TAILDESK_API_URL=prev.url; else delete process.env.TAILDESK_API_URL
    if(prev.key)process.env.TAILDESK_PLATFORM_API_KEY=prev.key; else delete process.env.TAILDESK_PLATFORM_API_KEY
  }
})

test('camelCase wrapped payloads and local filters still line up',()=>{
  const rows=[normalizeTenant({id:'a',name:'Alpha',subscription:{status:'active',plan_code:'starter'}}),normalizeTenant({tenantId:'b',name:'Beta',status:'on_hold'})]
  assert.equal(filterTenants(rows,{status:'on_hold'}).length,1)
  assert.equal(statsFromTenants(rows).stats.held,1)
  const pay=normalizePayment({id:'p',currency:'EUR',amount:'10.5',amountInInr:'940.25',status:'paid'})
  const roll=rollupPayments([pay])
  assert.equal(roll.by_currency[0].currency,'EUR')
  assert.equal(roll.by_currency[0].amount,10.5)
  assert.equal(roll.paid_inr,940.25)
  const events=collectEvents({subscriptions:[{tenantId:'b',events:[{id:'e',type:'invoice.paid',amount:10,currency:'EUR',amount_in_inr:940}]}]},{})
  assert.equal(events[0].hospital_id,'b')
  assert.equal(events[0].amount_in_inr,940)
})

test('HMS subscription currency columns are additive and backfill INR without changing amount_inr',async()=>{
  const sql=readFileSync(new URL('../db/migrations/042_subscription_currency.sql',import.meta.url),'utf8')
  assert.equal(/\bdrop\s+(table|column)\b/i.test(sql),false)
  const db=await freshDb()
  const {h,admin}=await tenant(db,'Cur Hosp','basic')
  const fresh=(await db.query('select currency,amount_in_inr from subscriptions where hospital_id=$1',[admin.hospitalId])).rows[0]
  assert.equal(fresh.currency,'INR')
  assert.equal(fresh.amount_in_inr,null)
  await db.query(`insert into subscription_payments(hospital_id,plan_code,billing_period,amount_inr,currency,status,provider) values($1,'basic','monthly',1999,'INR','captured','razorpay')`,[admin.hospitalId])
  await (db as any).exec(sql)
  const pay=(await db.query('select amount_inr,amount_in_inr,currency from subscription_payments where hospital_id=$1',[admin.hospitalId])).rows[0]
  assert.equal(Number(pay.amount_inr),1999)
  assert.equal(Number(pay.amount_in_inr),1999)
  assert.equal(pay.currency,'INR')
  const sub=(await db.query('select currency,amount_in_inr from subscriptions where hospital_id=$1',[admin.hospitalId])).rows[0]
  assert.equal(sub.currency,'INR')
  assert.equal(Number(sub.amount_in_inr),1999)
  const n=(await db.query('select count(*)::int n from hospitals where id=$1',[h.hospitalId])).rows[0].n
  assert.equal(n,1)
})

test('paid HMS plans store currency INR and amount_in_inr, and events do not leak payload secrets',async()=>{
  const db=await freshDb()
  const {admin}=await tenant(db,'Paid Hosp','basic')
  await activatePaidPlan(db,{hospitalId:admin.hospitalId,planCode:'basic',period:'monthly',paymentId:'pay_test_1',amountInr:19999,raw:{amount:19999,currency:'INR',secret:'sk_live_hidden'}})
  const sub=(await db.query('select status,currency,amount_in_inr from subscriptions where hospital_id=$1',[admin.hospitalId])).rows[0]
  assert.equal(sub.status,'active')
  assert.equal(sub.currency,'INR')
  assert.equal(Number(sub.amount_in_inr),19999)
  const pay=(await db.query('select amount_inr,amount_in_inr,currency from subscription_payments where hospital_id=$1',[admin.hospitalId])).rows[0]
  assert.equal(Number(pay.amount_inr),19999)
  assert.equal(Number(pay.amount_in_inr),19999)
  const stats=await platformPaymentStats(db)
  assert.equal(Number(stats.paid_inr),19999)
  assert.equal(stats.by_currency[0].currency,'INR')
  const events=await platformListEvents(db,{hospitalId:admin.hospitalId})
  assert.equal(events[0].event_type,'payment.captured')
  assert.equal(events[0].amount,19999)
  assert.equal(JSON.stringify(events).includes('sk_live_hidden'),false)
  await platformConvertPaid(db,admin.hospitalId,{id:'plat',email:'owner@hms.test'},'clinic')
  const converted=(await db.query('select plan_code,currency,amount_in_inr from subscriptions where hospital_id=$1',[admin.hospitalId])).rows[0]
  assert.equal(converted.plan_code,'clinic')
  assert.equal(converted.currency,'INR')
  assert.equal(Number(converted.amount_in_inr),1999)
})
