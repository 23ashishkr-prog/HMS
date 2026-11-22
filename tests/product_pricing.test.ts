import {test} from 'node:test'
import assert from 'node:assert/strict'
import {freshDb} from './helpers'
import {createOffer,discounted,endOffer,getCatalog,hmsMonthlyPayInr,liveOffer,listOffers,publicFeed,setPrice,todayIst} from '../lib/services/productPricing'
import {planChargeInr} from '../lib/services/razorpay'

async function setup(){
 const db=await freshDb()
 const a=(await db.query(`insert into platform_admins(email,full_name,password_hash) values('owner@greynova.in','Owner','x') returning id`)).rows[0]
 return {db,by:{id:String(a.id),email:'owner@greynova.in'}}
}
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)

test('seeded price book matches the current list prices',async()=>{
 const {db}=await setup()
 const c=await getCatalog(db)
 assert.deepEqual(c.products.hms.plans.map(p=>[p.code,p.monthlyInr]),[['clinic',1989],['engage',49890],['engage_support',89700]])
 assert.equal(c.products.taildesk.plans[0].monthlyInr,1489)
 assert.equal(c.products.smartshop.plans[0].monthlyInr,2489)
 assert.ok(c.products.hms.plans.every(p=>p.offer===null&&p.payInr===p.monthlyInr))
})

test('changing an HMS price updates checkout and the sign-up plans table',async()=>{
 const {db,by}=await setup()
 await setPrice(db,{product:'hms',planCode:'clinic',monthlyInr:2189},by)
 assert.equal((await hmsMonthlyPayInr(db,'clinic')).payInr,2189)
 assert.equal((await planChargeInr(db,'clinic','annual')).amountInr,21890)
 assert.equal(Number((await db.query(`select monthly_price_inr from plans where code='clinic'`)).rows[0].monthly_price_inr),2189)
 const log=(await db.query('select action,details from product_price_log')).rows
 assert.deepEqual(log[0].details,{from:1989,to:2189})
 await assert.rejects(setPrice(db,{product:'hms',planCode:'clinic',monthlyInr:0},by),/between/)
 await assert.rejects(setPrice(db,{product:'nope',planCode:'clinic',monthlyInr:5},by),/Unknown product/)
 await assert.rejects(setPrice(db,{product:'taildesk',planCode:'clinic',monthlyInr:5},by),/not found/)
})

test('a 10% offer shows the strike price and charges the offer price, then ends',async()=>{
 const {db,by}=await setup()
 const today=todayIst()
 await createOffer(db,{product:'hms',planCode:'engage',percent:10,label:'Diwali offer',startsOn:today,endsOn:addDays(today,10)},by)
 const c=await getCatalog(db)
 const e=c.products.hms.plans.find(p=>p.code==='engage')!
 assert.equal(e.monthlyInr,49890)
 assert.equal(e.offer?.priceInr,44901)
 assert.equal(e.payInr,44901)
 assert.equal(c.products.hms.plans.find(p=>p.code==='clinic')!.offer,null)
 const charge=await planChargeInr(db,'engage','monthly')
 assert.deepEqual([charge.amountInr,charge.listInr],[44901,49890])
 const feed:any=publicFeed(c)
 assert.equal(feed.products.hms.plans[1].offer.label,'Diwali offer')
 assert.equal(feed.products.hms.plans[1].offer.id,undefined)
 const [o]=await listOffers(db)
 await endOffer(db,o.id,by)
 assert.equal((await hmsMonthlyPayInr(db,'engage')).payInr,49890)
 await assert.rejects(endOffer(db,o.id,by),/already ended/)
})

test('a product-wide offer covers every plan, scheduled offers wait for their start date',async()=>{
 const {db,by}=await setup()
 const today=todayIst()
 await createOffer(db,{product:'taildesk',percent:20,startsOn:addDays(today,3),endsOn:addDays(today,9)},by)
 assert.equal((await getCatalog(db)).products.taildesk.plans[0].offer,null)
 const later=new Date(Date.parse(addDays(today,4)+'T06:00:00Z'))
 assert.equal((await getCatalog(db,later)).products.taildesk.plans[0].payInr,discounted(1489,20))
})

test('offer validation',async()=>{
 const {db,by}=await setup()
 const t=todayIst()
 await assert.rejects(createOffer(db,{product:'hms',percent:95,startsOn:t,endsOn:t},by),/between 1% and 90%/)
 await assert.rejects(createOffer(db,{product:'hms',percent:10,startsOn:t,endsOn:addDays(t,-1)},by),/before the start/)
 await assert.rejects(createOffer(db,{product:'hms',percent:10,startsOn:addDays(t,-9),endsOn:addDays(t,-2)},by),/already be over/)
 await assert.rejects(createOffer(db,{product:'hms',planCode:'zzz',percent:10,startsOn:t,endsOn:t},by),/not found/)
})

test('overlapping offers: the bigger discount wins; IST date boundary',()=>{
 const o=(id:string,percent:number,planCode:string|null)=>({id,product:'hms' as const,planCode,percent,label:'',startsOn:'2026-12-01',endsOn:'2026-12-31',active:true})
 assert.equal(liveOffer([o('a',10,null),o('b',15,'clinic')],'hms','clinic','2026-12-05')?.id,'b')
 assert.equal(liveOffer([o('a',10,null),o('b',15,'clinic')],'hms','engage','2026-12-05')?.id,'a')
 assert.equal(liveOffer([o('a',10,null)],'hms','clinic','2027-01-01'),null)
 assert.equal(todayIst(new Date('2026-11-30T18:31:00Z')),'2026-12-01')
 assert.equal(discounted(1989,10),1790)
})

test('falls back to built-in prices when the price book is unavailable',async()=>{
 const broken={query:async()=>{throw new Error('relation does not exist')}} as any
 const c=await getCatalog(broken)
 assert.equal(c.products.hms.plans.find(p=>p.code==='clinic')!.payInr,1989)
 assert.equal(c.products.smartshop.plans[0].payInr,2489)
})
