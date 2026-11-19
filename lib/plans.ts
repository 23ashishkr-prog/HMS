/** Single source of truth for SaaS plan catalogue (list prices from Market PMS, ex-GST).
 *  Update prices here only — migration 033 and marketing pages import from this file at seed/build time;
 *  DB plans.monthly_price_inr is kept in sync by the migration and platform edits. */
/** Sellable codes. basic and ai_engage stay in the type so current hospitals keep their plan. */
export const SELLABLE_CODES=['clinic','engage','engage_support'] as const
export const PLAN_CODES=['clinic','basic','ai_engage','engage','engage_support'] as const
export type PlanCode=typeof PLAN_CODES[number]
export type SellableCode=typeof SELLABLE_CODES[number]
const CLINIC_MODULES=['patients','appointments','queue','opd'] as const
const BASIC_MODULES=[...CLINIC_MODULES,'billing','lab','pharmacy','ipd','insurance','audit','bulk'] as const
const ENGAGE_MODULES=[...BASIC_MODULES,'ai','engagement'] as const
/** Monthly INR list, ex-GST. basic and ai_engage are grandfather prices, not on the picker. */
export const PLAN_PRICE_INR={clinic:1989,basic:19999,ai_engage:49999,engage:49890,engage_support:89700} as const
/** Annual is 10× monthly, the period the checkout already offers. Ex-GST. */
export const PLAN_ANNUAL_INR={clinic:19890,basic:199990,ai_engage:499990,engage:498900,engage_support:897000} as const
export const PLAN_NAME={
 clinic:'Clinic (Basic)',
 basic:'Basic',
 ai_engage:'AI + Customer Engagement',
 engage:'Customer Engagement',
 engage_support:'Customer Engagement + 1 Support Admin',
} as const
export const PLAN_BLURB={
 clinic:'Online appointment + token booking so patients meet the doctor with documents',
 basic:'Complete hospital operations — registration, OPD, billing, lab, pharmacy, IPD',
 ai_engage:'Everything in Basic, plus AI doctor assistant and WhatsApp/e-mail patient engagement',
 engage:'Full hospital operations, plus AI doctor assistant and WhatsApp/e-mail patient engagement',
 engage_support:'Everything in Customer Engagement, plus one dedicated support admin',
} as const
/** Included GreyNova support-admin seats. Not a cap on the hospital's own users. */
export const PLAN_SUPPORT_ADMINS:Record<PlanCode,number>={clinic:0,basic:0,ai_engage:0,engage:0,engage_support:1}
/** Modules each plan unlocks. Server enforce via requireModule; UI greys the rest. */
export const PLAN_MODULES:Record<PlanCode,readonly string[]>={
 clinic:CLINIC_MODULES,
 basic:BASIC_MODULES,
 ai_engage:ENGAGE_MODULES,
 engage:ENGAGE_MODULES,
 engage_support:ENGAGE_MODULES,
}
/** Self-serve 30-day trial is Clinic (Basic) only. Both Customer Engagement plans are Contact Sales. */
export const SELF_SERVE_TRIALS=['clinic'] as const
/** Default when ?plan is missing. ?plan=clinic and ?plan=basic both select this. */
export const TRIAL_PLAN:PlanCode='clinic'
export const TRIAL_DAYS_DEFAULT=30
export const TRIAL_DAYS=()=>Number(process.env.TRIAL_DAYS||TRIAL_DAYS_DEFAULT)
/** In-app and outbox reminders. Idempotent per hospital + day threshold + trial end. */
export const TRIAL_REMINDER_DAYS=[7,3,1] as const
const DAY_MS=86400000
/** Whole days remaining until trial end. 0 means expired. null if there is no end date. */
export function trialDaysRemaining(endsAt:Date|string|null|undefined,now=new Date()):number|null{
 if(endsAt==null||endsAt==='')return null
 const end=endsAt instanceof Date?endsAt:new Date(endsAt)
 if(Number.isNaN(end.getTime()))return null
 const ms=end.getTime()-now.getTime()
 if(ms<=0)return 0
 return Math.ceil(ms/DAY_MS)
}
/** Trial copy is only for a live trial. The cross-app banner waits until the last 7 days; a paid (active) plan never qualifies. */
export function showTrialCountdown(status?:string|null,daysLeft?:number|null,opts?:{banner?:boolean}){
 if(status!=='trialing'||daysLeft==null)return false
 if(opts?.banner&&daysLeft>7)return false
 return true
}
/** Which reminder thresholds are due when this many days remain (positive only). */
export function dueTrialReminders(daysLeft:number|null):number[]{
 if(daysLeft==null||daysLeft<=0)return []
 return TRIAL_REMINDER_DAYS.filter(d=>daysLeft<=d)
}
/** ?plan=clinic and ?plan=basic both start the Clinic (Basic) trial. Anything else falls back to it. */
export function trialPlanFromParam(raw:unknown):PlanCode{
 const x=String(raw??'').trim().toLowerCase()
 if(x==='clinic'||x==='basic')return 'clinic'
 return 'clinic'
}
/** Customer Engagement plans, and the old AI+ names, have no self-serve trial. */
export function isContactSalesPlan(raw:unknown):boolean{
 const x=String(raw??'').trim().toLowerCase()
 return x==='engage'||x==='engage_support'||x==='ai_engage'||x==='pro'||x==='enterprise'
}
/** New checkout only. Keeps grandfathered hospitals on basic / ai_engage when their stored code is used. */
export function planForNewSale(raw:unknown):SellableCode{
 const x=String(raw??'').trim().toLowerCase()
 if(x==='engage_support')return 'engage_support'
 if(x==='engage'||x==='ai_engage'||x==='pro'||x==='enterprise')return 'engage'
 return 'clinic'
}
export const AI_FEATURES=[
 {id:'ai',name:'AI doctor assistant',detail:'History card, ICD suggestions, prescription checks, dictation and patient-friendly rewrite'},
 {id:'engagement',name:'Customer engagement',detail:'WhatsApp and e-mail reminders, booking and follow-up messages'},
] as const
export function aiFeaturesFor(code:PlanCode){
 const mods=PLAN_MODULES[code]
 return AI_FEATURES.map(f=>({...f,included:mods.includes(f.id)}))
}
/** Which paid plan unlocks a missing module (for upgrade CTAs). */
export function upgradePlanFor(module:string):PlanCode{
 if(PLAN_MODULES.clinic.includes(module))return 'clinic'
 return 'engage'
}
export function upgradeLabel(module:string){const p=upgradePlanFor(module);return `Available on ${PLAN_NAME[p]} plan`}
/** Stored plan codes stay put. pro/enterprise still mean the grandfathered AI+ plan. Unknown new sales use Clinic. */
export function canonicalPlan(c:string|null|undefined):PlanCode{
 const x=String(c||'').toLowerCase()
 if(x==='clinic')return 'clinic'
 if(x==='basic')return 'basic'
 if(x==='engage')return 'engage'
 if(x==='engage_support')return 'engage_support'
 if(x==='pro'||x==='enterprise'||x==='ai_engage')return 'ai_engage'
 return 'clinic'
}
export const PLAN_CATALOGUE=SELLABLE_CODES.map(code=>({
 code,name:PLAN_NAME[code],monthly_price_inr:PLAN_PRICE_INR[code],annual_price_inr:PLAN_ANNUAL_INR[code],
 modules:[...PLAN_MODULES[code]],blurb:PLAN_BLURB[code],supportAdmins:PLAN_SUPPORT_ADMINS[code],
 contactSales:code!=='clinic',
}))
