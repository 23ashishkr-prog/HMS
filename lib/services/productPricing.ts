/** One price book for HMS, TailDesk and Smart Shop.
 *  The platform console edits it; HMS checkout, the public site and the partner apps read it
 *  (partners and the site through GET /api/public/pricing). Amounts are monthly INR, ex-GST.
 *  An offer takes a percentage off one plan, or every plan of a product, between two IST dates. */
import {Db,HttpError} from './core'
import {PLAN_NAME,PLAN_PRICE_INR,SELLABLE_CODES} from '../plans'

export const PRODUCTS=['hms','taildesk','smartshop'] as const
export type Product=typeof PRODUCTS[number]
export const PRODUCT_NAME:Record<Product,string>={hms:'Hospital Cloud (HMS)',taildesk:'TailDesk',smartshop:'Smart Shop'}

export type Offer={id:string;product:Product;planCode:string|null;percent:number;label:string;startsOn:string;endsOn:string;active:boolean}
export type PlanPrice={
 code:string;name:string;monthlyInr:number;sort:number;updatedAt:string|null
 /** Offer running today, if any. priceInr is what the customer pays this month. */
 offer:null|{id:string;percent:number;label:string;endsOn:string;priceInr:number}
 /** What checkout charges for a month today (offer price, or list price). */
 payInr:number
}
export type Catalog={today:string;products:Record<Product,{name:string;plans:PlanPrice[]}>}

/** Fallback when the table is missing or the DB is down, so checkout never charges zero. */
export const DEFAULT_PRICES:Record<Product,{code:string;name:string;monthlyInr:number}[]>={
 hms:SELLABLE_CODES.map(code=>({code,name:PLAN_NAME[code],monthlyInr:PLAN_PRICE_INR[code]})),
 taildesk:[{code:'hospital',name:'TailDesk Complete',monthlyInr:1489}],
 smartshop:[{code:'standard',name:'Smart Shop Standard',monthlyInr:2489}],
}

const DATE=/^\d{4}-\d{2}-\d{2}$/
export function isProduct(v:unknown):v is Product{return typeof v==='string'&&(PRODUCTS as readonly string[]).includes(v)}
/** Calendar date in India, which is when offers start and end. */
export function todayIst(now=new Date()){return new Date(now.getTime()+330*60000).toISOString().slice(0,10)}
const iso=(d:unknown)=>d instanceof Date?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10):String(d??'').slice(0,10)

/** Offer price: whole rupees, never below ₹1. */
export function discounted(listInr:number,percent:number){return Math.max(1,Math.round(listInr*(100-percent)/100))}

/** The best offer running on `today` for this plan (plan-specific or product-wide). Highest percent wins. */
export function liveOffer(offers:Offer[],product:Product,planCode:string,today:string){
 let best:Offer|null=null
 for(const o of offers){
  if(!o.active||o.product!==product)continue
  if(o.planCode&&o.planCode!==planCode)continue
  if(today<o.startsOn||today>o.endsOn)continue
  if(!best||o.percent>best.percent)best=o
 }
 return best
}

export function priceRow(p:{code:string;name:string;monthlyInr:number;sort?:number;updatedAt?:string|null},offers:Offer[],product:Product,today:string):PlanPrice{
 const o=liveOffer(offers,product,p.code,today)
 const offer=o?{id:o.id,percent:o.percent,label:o.label,endsOn:o.endsOn,priceInr:discounted(p.monthlyInr,o.percent)}:null
 return {code:p.code,name:p.name,monthlyInr:p.monthlyInr,sort:p.sort??0,updatedAt:p.updatedAt??null,offer,payInr:offer?offer.priceInr:p.monthlyInr}
}

const offerFromRow=(r:any):Offer=>({id:String(r.id),product:r.product,planCode:r.plan_code||null,percent:Number(r.percent),label:String(r.label||''),startsOn:iso(r.starts_on),endsOn:iso(r.ends_on),active:!!r.active})

export async function listOffers(db:Db,opts:{includeEnded?:boolean}={}):Promise<Offer[]>{
 const rows=(await db.query(`select id,product,plan_code,percent,label,starts_on,ends_on,active from product_offers
  ${opts.includeEnded?'':`where active and ends_on>=$1::date`} order by starts_on desc,created_at desc limit 200`,opts.includeEnded?[]:[todayIst()])).rows
 return rows.map(offerFromRow)
}

function fallbackCatalog(today:string):Catalog{
 const products={} as Catalog['products']
 for(const p of PRODUCTS)products[p]={name:PRODUCT_NAME[p],plans:DEFAULT_PRICES[p].map((x,i)=>priceRow({...x,sort:i+1},[],p,today))}
 return {today,products}
}

/** Every product's plans with today's offer applied. Falls back to the built-in prices if the table is unavailable. */
export async function getCatalog(db:Db,now=new Date()):Promise<Catalog>{
 const today=todayIst(now)
 let rows:any[],offers:Offer[]
 try{
  rows=(await db.query('select product,plan_code,name,monthly_inr,sort,updated_at from product_prices order by product,sort,plan_code')).rows
  offers=(await db.query(`select id,product,plan_code,percent,label,starts_on,ends_on,active from product_offers where active and $1::date between starts_on and ends_on`,[today])).rows.map(offerFromRow)
 }catch{return fallbackCatalog(today)}
 const cat=fallbackCatalog(today)
 for(const p of PRODUCTS){
  const mine=rows.filter(r=>r.product===p)
  if(mine.length)cat.products[p].plans=mine.map(r=>priceRow({code:r.plan_code,name:r.name,monthlyInr:Number(r.monthly_inr),sort:r.sort,updatedAt:r.updated_at?new Date(r.updated_at).toISOString():null},offers,p,today))
 }
 return cat
}

/** What checkout charges for one month of an HMS plan today. */
export async function hmsMonthlyPayInr(db:Db,planCode:string,now=new Date()){
 const cat=await getCatalog(db,now)
 const p=cat.products.hms.plans.find(x=>x.code===planCode)
 if(p)return {payInr:p.payInr,listInr:p.monthlyInr,offer:p.offer}
 const list=(PLAN_PRICE_INR as Record<string,number>)[planCode]
 if(!list)throw new HttpError(400,'Unknown plan.')
 return {payInr:list,listInr:list,offer:null}
}

async function log(db:Db,product:string,planCode:string|null,action:string,details:Record<string,unknown>,by:{id:string;email:string}){
 await db.query('insert into product_price_log(product,plan_code,action,details,by_admin,by_email) values($1,$2,$3,$4,$5,$6)',[product,planCode,action,JSON.stringify(details),by.id,by.email])
}

/** Change a plan's monthly INR list price. HMS plans also update the plans table the sign-up pages read. */
export async function setPrice(db:Db,input:{product:unknown;planCode:unknown;monthlyInr:unknown},by:{id:string;email:string}){
 if(!isProduct(input.product))throw new HttpError(400,'Unknown product.')
 const code=String(input.planCode||'').trim()
 const amount=Number(input.monthlyInr)
 if(!Number.isFinite(amount)||amount<1||amount>10000000)throw new HttpError(400,'Enter a monthly price between ₹1 and ₹1,00,00,000.')
 const inr=Math.round(amount)
 const before=(await db.query('select monthly_inr from product_prices where product=$1 and plan_code=$2',[input.product,code])).rows[0]
 if(!before)throw new HttpError(404,'Plan not found.')
 await db.query('update product_prices set monthly_inr=$3,updated_by=$4,updated_at=now() where product=$1 and plan_code=$2',[input.product,code,inr,by.id])
 if(input.product==='hms')await db.query('update plans set monthly_price_inr=$2 where code=$1',[code,inr])
 await log(db,input.product,code,'price',{from:Number(before.monthly_inr),to:inr},by)
 return getCatalog(db)
}

/** Start an offer. Dates are IST calendar days, both included. */
export async function createOffer(db:Db,input:{product:unknown;planCode?:unknown;percent:unknown;label?:unknown;startsOn:unknown;endsOn:unknown},by:{id:string;email:string}){
 if(!isProduct(input.product))throw new HttpError(400,'Unknown product.')
 const percent=Math.round(Number(input.percent)*100)/100
 if(!Number.isFinite(percent)||percent<=0||percent>90)throw new HttpError(400,'Discount must be between 1% and 90%.')
 const startsOn=String(input.startsOn||''),endsOn=String(input.endsOn||'')
 if(!DATE.test(startsOn)||!DATE.test(endsOn))throw new HttpError(400,'Pick a start and an end date.')
 if(endsOn<startsOn)throw new HttpError(400,'The end date is before the start date.')
 if(endsOn<todayIst())throw new HttpError(400,'That offer would already be over.')
 const planCode=String(input.planCode||'').trim()||null
 if(planCode){
  const ok=(await db.query('select 1 from product_prices where product=$1 and plan_code=$2',[input.product,planCode])).rows[0]
  if(!ok)throw new HttpError(404,'Plan not found.')
 }
 const label=String(input.label||'').trim().slice(0,60)
 const r=(await db.query(`insert into product_offers(product,plan_code,percent,label,starts_on,ends_on,created_by) values($1,$2,$3,$4,$5,$6,$7) returning id`,
  [input.product,planCode,percent,label,startsOn,endsOn,by.id])).rows[0]
 await log(db,input.product,planCode,'offer_start',{id:r.id,percent,label,startsOn,endsOn},by)
 return getCatalog(db)
}

/** End an offer now. Customers go back to the list price straight away. */
export async function endOffer(db:Db,id:unknown,by:{id:string;email:string}){
 const r=(await db.query('update product_offers set active=false,ended_at=now() where id=$1 and active returning product,plan_code,percent',[String(id||'')])).rows[0]
 if(!r)throw new HttpError(404,'Offer not found or already ended.')
 await log(db,r.product,r.plan_code,'offer_end',{id,percent:Number(r.percent)},by)
 return getCatalog(db)
}

export async function priceLog(db:Db,limit=30){
 return (await db.query('select product,plan_code,action,details,by_email,at from product_price_log order by at desc limit $1',[limit])).rows
}

/** Public feed. Only what a pricing page shows: no admin ids, no future offers. */
export function publicFeed(cat:Catalog){
 const products:Record<string,unknown>={}
 for(const p of PRODUCTS)products[p]={name:cat.products[p].name,currency:'INR',period:'month',plans:cat.products[p].plans.map(x=>({
  code:x.code,name:x.name,monthlyInr:x.monthlyInr,payInr:x.payInr,
  offer:x.offer?{percent:x.offer.percent,label:x.offer.label,endsOn:x.offer.endsOn,priceInr:x.offer.priceInr}:null,
 }))}
 return {version:1,today:cat.today,products}
}
