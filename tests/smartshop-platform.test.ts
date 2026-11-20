import {test} from 'node:test'
import assert from 'node:assert/strict'
import {partnerOf,runPartner,smartshopAdmins,smartshopResetAdmin,taildeskCreds,taildeskHospitalDetail,taildeskHospitalList,taildeskPayments} from '../lib/services/taildesk'

const KEY='ss_live_test_key_1234567890abcdef'

const TENANTS={product:'smartshop',tenants:[
  {id:'shop_1',name:'Sharma Sweets',code:'sharma-sweets',status:'active',created_at:'2026-11-01T00:00:00Z',contact_email:'owner@sharma.test',
   admin_name:'Anita',admin_email:'owner@sharma.test',admin_phone:'+9199',users:4,
   subscription:{id:'sub_1',status:'trialing',plan_code:'STANDARD',plan_name:'Smart Shop Standard',billing_period:'monthly',trial_started_at:'2026-11-01T00:00:00Z',trial_ends_at:'2026-12-01T00:00:00Z',amount:2489,currency:'INR',amount_in_inr:2489}},
  {id:'shop_2',name:'Gupta Bakery',code:'gupta-bakery',status:'active',admin_name:'Ravi',users:2,
   subscription:{id:'sub_2',status:'active',plan_code:'STANDARD',plan_name:'Smart Shop Standard',billing_period:'monthly',current_period_start:'2026-11-05T00:00:00Z',current_period_end:'2026-12-05T00:00:00Z',amount:2489,currency:'INR',amount_in_inr:2489}},
]}
const SUBS={product:'smartshop',subscriptions:[],events:[{id:'ev1',tenant_id:'shop_2',tenant_name:'Gupta Bakery',tenant_code:'gupta-bakery',event_type:'payment_confirmed',received_at:'2026-11-05T10:00:00Z',plan_code:'STANDARD',currency:'INR',amount:2489,amount_in_inr:2489}]}
const REV={product:'smartshop',payments:[{id:'pay1',tenant_id:'shop_2',tenant_name:'Gupta Bakery',tenant_code:'gupta-bakery',plan_code:'STANDARD',plan_name:'Smart Shop Standard',amount:2489,currency:'INR',amount_in_inr:2489,status:'captured',provider:'upi_manual',provider_payment_id:'UTR123456',paid_at:'2026-11-05T10:00:00Z',created_at:'2026-11-05T09:00:00Z'}]}

async function withSmartShop<T>(fn:()=>Promise<T>):Promise<{result:T;calls:{url:string;auth:string|null}[]}>{
  const prev={url:process.env.SMARTSHOP_API_URL,key:process.env.SMARTSHOP_PLATFORM_API_KEY,fetch:globalThis.fetch}
  const calls:{url:string;auth:string|null}[]=[]
  process.env.SMARTSHOP_API_URL='https://smart-shop.example.test'
  process.env.SMARTSHOP_PLATFORM_API_KEY=KEY
  globalThis.fetch=(async(input:any,init:any)=>{
    const u=new URL(String(input))
    calls.push({url:u.pathname,auth:init?.headers?.Authorization||null})
    const body=u.pathname.endsWith('/tenants')?TENANTS:u.pathname.endsWith('/subscriptions')?SUBS:u.pathname.endsWith('/revenue')?REV:{}
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}})
  }) as any
  try{return {result:await fn(),calls}}
  finally{
    globalThis.fetch=prev.fetch
    if(prev.url===undefined)delete process.env.SMARTSHOP_API_URL;else process.env.SMARTSHOP_API_URL=prev.url
    if(prev.key===undefined)delete process.env.SMARTSHOP_PLATFORM_API_KEY;else process.env.SMARTSHOP_PLATFORM_API_KEY=prev.key
  }
}

test('partnerOf recognises smartshop and taildesk only',()=>{
  assert.equal(partnerOf('smartshop'),'smartshop')
  assert.equal(partnerOf(' SmartShop '),'smartshop')
  assert.equal(partnerOf('taildesk'),'taildesk')
  assert.equal(partnerOf('hms'),null)
  assert.equal(partnerOf(''),null)
})

test('smartshop credentials come from SMARTSHOP_* env, not TAILDESK_*',async()=>{
  const prevTd=process.env.TAILDESK_API_URL;process.env.TAILDESK_API_URL='https://td.example.test'
  const prevTk=process.env.TAILDESK_PLATFORM_API_KEY;process.env.TAILDESK_PLATFORM_API_KEY='td_key'
  try{
    assert.equal(runPartner('smartshop',()=>taildeskCreds()),null)
    await withSmartShop(async()=>{
      assert.equal(runPartner('smartshop',()=>taildeskCreds())?.base,'https://smart-shop.example.test')
      assert.equal(runPartner('taildesk',()=>taildeskCreds())?.base,'https://td.example.test')
    })
  }finally{
    if(prevTd===undefined)delete process.env.TAILDESK_API_URL;else process.env.TAILDESK_API_URL=prevTd
    if(prevTk===undefined)delete process.env.TAILDESK_PLATFORM_API_KEY;else process.env.TAILDESK_PLATFORM_API_KEY=prevTk
  }
})

test('shops list: subscriptions and trial/active stats are tracked, with no shop activity',async()=>{
  const {result:d,calls}=await withSmartShop(()=>runPartner('smartshop',()=>taildeskHospitalList(new URLSearchParams())))
  assert.equal((d as any).configured,true)
  assert.equal((d as any).product,'smartshop')
  const rows=(d as any).hospitals
  assert.equal(rows.length,2)
  const a=rows.find((r:any)=>r.id==='shop_1')
  assert.equal(a.name,'Sharma Sweets');assert.equal(a.code,'sharma-sweets')
  assert.equal(a.sub_status,'trialing');assert.equal(a.plan_name,'Smart Shop Standard');assert.equal(a.amount_in_inr,2489)
  assert.equal(a.admin_email,'owner@sharma.test')
  assert.equal('activity' in a,false,'shop activity is not part of the console')
  const b=rows.find((r:any)=>r.id==='shop_2')
  assert.equal(b.sub_status,'active');assert.ok(b.current_period_end)
  assert.equal((d as any).stats.total,2);assert.equal((d as any).stats.trial,1);assert.equal((d as any).stats.active,1)
  assert.ok(calls.every(c=>c.auth===`Bearer ${KEY}`),'every upstream call sends the bearer key')
  assert.ok(calls.some(c=>c.url==='/api/platform/v1/tenants'))
  assert.equal((d as any).events[0].event_type,'payment_confirmed')
})

test('shop detail and revenue come through with the partner label',async()=>{
  const {result:det}=await withSmartShop(()=>runPartner('smartshop',()=>taildeskHospitalDetail('shop_2')))
  assert.equal((det as any).hospital.name,'Gupta Bakery')
  assert.equal((det as any).payments.length,1)
  const {result:rev}=await withSmartShop(()=>runPartner('smartshop',()=>taildeskPayments(new URLSearchParams())))
  assert.equal((rev as any).payments[0].provider_payment_id,'UTR123456')
  assert.equal((rev as any).stats.paid_inr,2489)
})

test('unconfigured Smart Shop says so by name and names its env vars',async()=>{
  const d=await runPartner('smartshop',()=>taildeskHospitalList(new URLSearchParams()))
  assert.equal((d as any).configured,false)
  assert.match(String((d as any).message),/Smart Shop is not configured/)
  assert.match(String((d as any).message),/SMARTSHOP_API_URL/)
})

test('owner password reset goes to Smart Shop with the bearer key; TailDesk is not touched',async()=>{
  const prev={url:process.env.SMARTSHOP_API_URL,key:process.env.SMARTSHOP_PLATFORM_API_KEY,fetch:globalThis.fetch}
  const seen:{method:string;path:string;auth:string|null;body:any}[]=[]
  process.env.SMARTSHOP_API_URL='https://smart-shop.example.test';process.env.SMARTSHOP_PLATFORM_API_KEY=KEY
  globalThis.fetch=(async(input:any,init:any)=>{
    const u=new URL(String(input))
    seen.push({method:init?.method||'GET',path:u.pathname,auth:init?.headers?.Authorization||null,body:init?.body?JSON.parse(init.body):null})
    const out=u.pathname.endsWith('/admins')?{admins:[{id:'u1',full_name:'Anita',email:'owner@sharma.test',active:true}]}:{ok:true,email:'owner@sharma.test',fullName:'Anita',temporaryPassword:'Ss-temp123',loginUrl:'/login/sharma'}
    return new Response(JSON.stringify(out),{status:200,headers:{'content-type':'application/json'}})
  }) as any
  try{
    const list:any=await runPartner('smartshop',()=>smartshopAdmins('shop_1'))
    assert.equal(list.admins[0].full_name,'Anita')
    const r:any=await runPartner('smartshop',()=>smartshopResetAdmin('shop_1',{userId:'u1'}))
    assert.equal(r.temporaryPassword,'Ss-temp123')
    assert.deepEqual(seen.map(x=>x.method+' '+x.path),['GET /api/platform/v1/tenants/shop_1/admins','POST /api/platform/v1/tenants/shop_1/reset-admin-password'])
    assert.ok(seen.every(x=>x.auth===`Bearer ${KEY}`))
    assert.deepEqual(seen[1].body,{userId:'u1'})
  }finally{
    globalThis.fetch=prev.fetch
    if(prev.url===undefined)delete process.env.SMARTSHOP_API_URL;else process.env.SMARTSHOP_API_URL=prev.url
    if(prev.key===undefined)delete process.env.SMARTSHOP_PLATFORM_API_KEY;else process.env.SMARTSHOP_PLATFORM_API_KEY=prev.key
  }
})

test('reset without configuration fails clearly and never leaks the key',async()=>{
  await assert.rejects(()=>runPartner('smartshop',()=>smartshopResetAdmin('shop_1',{})),/Smart Shop is not configured/)
})
