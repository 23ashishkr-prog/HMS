/** Single source of truth for SaaS plan catalogue (list prices from Market PMS, ex-GST).
 *  Update prices here only — migration 033 and marketing pages import from this file at seed/build time;
 *  DB plans.monthly_price_inr is kept in sync by the migration and platform edits. */
export const PLAN_CODES=['clinic','basic','ai_engage'] as const
export type PlanCode=typeof PLAN_CODES[number]
/** Final India list prices (Market PMS). Monthly INR, ex-GST. */
export const PLAN_PRICE_INR={clinic:1999,basic:19999,ai_engage:49999} as const
/** Annual list (10× monthly — same Market PMS sheet). Ex-GST. */
export const PLAN_ANNUAL_INR={clinic:19990,basic:199990,ai_engage:499990} as const
export const PLAN_NAME={clinic:'Clinic',basic:'Basic',ai_engage:'AI + Customer Engagement'} as const
export const PLAN_BLURB={
 clinic:'Online appointment + token booking so patients meet the doctor with documents',
 basic:'Complete hospital operations — registration, OPD, billing, lab, pharmacy, IPD',
 ai_engage:'Everything in Basic, plus AI doctor assistant and WhatsApp/e-mail patient engagement',
} as const
/** Modules each plan unlocks. Server enforce via requireModule; UI greys the rest. */
export const PLAN_MODULES:Record<PlanCode,readonly string[]>={
 clinic:['patients','appointments','queue','opd'],
 basic:['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk'],
 ai_engage:['patients','appointments','queue','opd','billing','lab','pharmacy','ipd','insurance','audit','bulk','ai','engagement'],
}
/** Self-serve 30-day trials: Clinic and Basic. AI + Customer Engagement is Contact Sales. */
export const SELF_SERVE_TRIALS=['clinic','basic'] as const
/** Default when ?plan is missing or not clinic/basic. */
export const TRIAL_PLAN:PlanCode='basic'
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
/** ?plan=clinic|basic. Unknown values, including empty, fall back to basic. ai_engage is not a trial. */
export function trialPlanFromParam(raw:unknown):PlanCode{
 const x=String(raw??'').trim().toLowerCase()
 if(x==='clinic'||x==='basic')return x
 return 'basic'
}
/** pro/enterprise are legacy names for AI + Customer Engagement. */
export function isContactSalesPlan(raw:unknown):boolean{
 const x=String(raw??'').trim().toLowerCase()
 return x==='ai_engage'||x==='pro'||x==='enterprise'
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
 if(PLAN_MODULES.basic.includes(module))return 'basic'
 return 'ai_engage'
}
export function upgradeLabel(module:string){const p=upgradePlanFor(module);return `Available on ${PLAN_NAME[p]} plan`}
/** Legacy codes (pre-031 / pre-033) → current. */
export function canonicalPlan(c:string|null|undefined):PlanCode{
 const x=String(c||'').toLowerCase()
 if(x==='clinic')return 'clinic'
 if(x==='pro'||x==='enterprise'||x==='ai_engage')return 'ai_engage'
 return 'basic'
}
export const PLAN_CATALOGUE=PLAN_CODES.map(code=>({
 code,name:PLAN_NAME[code],monthly_price_inr:PLAN_PRICE_INR[code],annual_price_inr:PLAN_ANNUAL_INR[code],
 modules:[...PLAN_MODULES[code]],blurb:PLAN_BLURB[code],
}))
