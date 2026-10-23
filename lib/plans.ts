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
/** Free trial: Basic only, 30 days. Never Clinic, never AI/engagement. */
export const TRIAL_PLAN:PlanCode='basic'
export const TRIAL_DAYS_DEFAULT=30
export const TRIAL_DAYS=()=>Number(process.env.TRIAL_DAYS||TRIAL_DAYS_DEFAULT)
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
