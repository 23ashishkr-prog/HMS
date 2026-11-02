/** Read-only TailDesk (Pemily / PetCare) platform data.
 *  HMS never writes this database. Missing env degrades to a not-configured state.
 *
 *  Upstream (PetCare): GET {TAILDESK_API_URL}/api/platform/v1/tenants|subscriptions|revenue
 *  Auth: Authorization: Bearer $TAILDESK_PLATFORM_API_KEY and X-Platform-Api-Key.
 *
 *  Accepted shapes (snake or camel, bare array, or {data}): tenants/subscriptions/revenue
 *  with plan, status, trial/period, currency, amount, amount_in_inr, and events.
 */
import {moneyNumber, currencyCode} from '../money'
import {HttpError} from './core'

const SUB_STATES = new Set(['trialing', 'active', 'past_due', 'cancelled', 'expired', 'on_hold'])
const PAID = new Set(['captured', 'authorized', 'paid', 'succeeded'])

export function isTailDeskProduct(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'taildesk'
}

export type TailDeskCreds = {base: string; key: string}

export function taildeskCreds(): TailDeskCreds | null {
  const raw = (process.env.TAILDESK_API_URL || '').trim()
  const key = (process.env.TAILDESK_PLATFORM_API_KEY || '').trim()
  if (!raw || !key) return null
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  const path = url.pathname.replace(/\/$/, '')
  return {base: url.origin + (path === '/' ? '' : path), key}
}

export function taildeskConfigured() { return taildeskCreds() != null }

function scrub(message: string, key: string) {
  const hidden = key ? message.split(key).join('***') : message
  return hidden.replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 300)
}

export class TailDeskError extends Error {
  status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  if (b.endsWith('/api') && p.startsWith('/api/')) return b + p.slice(4)
  return b + p
}

async function tdGet(path: string, query: URLSearchParams) {
  const creds = taildeskCreds()
  if (!creds) throw new TailDeskError('TailDesk is not configured.')
  const url = new URL(joinUrl(creds.base, path))
  // Date windows only. Search, plan, and status stay local so totals match HMS:
  // stats are the full book, and the table is the filtered slice.
  for (const k of ['after', 'before', 'from', 'to']) {
    const v = query.get(k)
    if (v) url.searchParams.set(k, v)
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${creds.key}`,
        'X-Platform-Api-Key': creds.key,
      },
      signal: AbortSignal.timeout(12000),
    })
  } catch (e) {
    throw new TailDeskError(scrub(e instanceof Error ? e.message : 'TailDesk platform API unreachable', creds.key))
  }
  const text = await res.text()
  let body: any
  try { body = text ? JSON.parse(text) : {} } catch {
    throw new TailDeskError(`TailDesk platform API returned ${res.status} without JSON`, res.status)
  }
  if (!res.ok) {
    const msg = typeof body?.error === 'string' ? body.error : (typeof body?.message === 'string' ? body.message : `TailDesk platform API returned ${res.status}`)
    throw new TailDeskError(scrub(msg, creds.key), res.status)
  }
  return body
}

function asList(raw: any, keys: string[]): any[] {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k]
  const data = raw.data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const k of keys) if (Array.isArray(data[k])) return data[k]
  }
  return []
}

function pick(obj: any, keys: string[]) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== '') return v
  }
  return undefined
}

function canonStatus(value: unknown): string {
  const x = String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
  if (!x) return ''
  if (x === 'canceled' || x === 'cancelled') return 'cancelled'
  if (x === 'paused' || x === 'hold' || x === 'onhold' || x === 'on-hold') return 'on_hold'
  if (x === 'trial' || x === 'in_trial' || x === 'trialing') return 'trialing'
  if (x === 'paid' || x === 'live') return 'active'
  return x
}

function planOf(row: any, sub: any) {
  const planObj = row?.plan && typeof row.plan === 'object' ? row.plan : (sub?.plan && typeof sub.plan === 'object' ? sub.plan : null)
  const code = pick(sub, ['plan_code', 'planCode', 'code']) || pick(row, ['plan_code', 'planCode']) || (typeof row?.plan === 'string' ? row.plan : undefined) || (planObj ? pick(planObj, ['code', 'plan_code', 'planCode']) : undefined)
  const name = pick(sub, ['plan_name', 'planName', 'name']) || pick(row, ['plan_name', 'planName']) || (planObj ? pick(planObj, ['name', 'plan_name', 'planName']) : undefined)
  return {plan_code: code ? String(code) : null, plan_name: name ? String(name) : null}
}

function moneyOf(row: any, sub?: any) {
  const currency = currencyCode(pick(sub, ['currency']) || pick(row, ['currency']) || 'INR')
  const amount = moneyNumber(pick(sub, ['amount', 'price']) ?? pick(row, ['amount', 'price']))
  let amountInInr = moneyNumber(pick(sub, ['amount_in_inr', 'amountInInr']) ?? pick(row, ['amount_in_inr', 'amountInInr']))
  const legacyInr = moneyNumber(pick(sub, ['amount_inr', 'amountInr']) ?? pick(row, ['amount_inr', 'amountInr']))
  if (amountInInr == null && legacyInr != null && (currency === 'INR' || amount != null)) amountInInr = legacyInr
  if (amountInInr == null && currency === 'INR') amountInInr = amount ?? legacyInr
  const original = amount ?? (currency === 'INR' ? amountInInr : legacyInr)
  return {currency, amount: original, amount_in_inr: amountInInr, amount_inr: amountInInr}
}

function datesOf(row: any, sub?: any) {
  const g = (keys: string[]) => {
    const v = pick(sub, keys) || pick(row, keys)
    return v == null ? null : String(v)
  }
  return {
    trial_started_at: g(['trial_started_at', 'trialStartedAt', 'trial_start']),
    trial_ends_at: g(['trial_ends_at', 'trialEndsAt', 'trial_end', 'trialEnd']),
    current_period_start: g(['current_period_start', 'currentPeriodStart', 'period_start', 'periodStart', 'started_at', 'startedAt']),
    current_period_end: g(['current_period_end', 'currentPeriodEnd', 'period_end', 'periodEnd', 'expires_at', 'expiresAt', 'expiry']),
  }
}

export function normalizeTenant(row: any) {
  const sub = row?.subscription && typeof row.subscription === 'object' ? row.subscription : (row?.plan_subscription || {})
  const admin = row?.admin || row?.owner || {}
  const plan = planOf(row, sub)
  const explicitSub = pick(sub, ['status', 'sub_status', 'subscription_status']) || pick(row, ['sub_status', 'subscription_status', 'subscriptionStatus'])
  const rawStatus = pick(row, ['status', 'tenant_status', 'tenantStatus'])
  const subStatus = canonStatus(explicitSub || (SUB_STATES.has(canonStatus(rawStatus)) ? rawStatus : ''))
  const tenantStatus = explicitSub ? String(rawStatus || 'active') : 'active'
  const money = moneyOf(row, sub)
  return {
    id: String(pick(row, ['id', 'tenant_id', 'tenantId', 'business_id', 'businessId']) || ''),
    name: String(pick(row, ['name', 'business_name', 'businessName', 'tenant_name', 'tenantName']) || '—'),
    code: String(pick(row, ['code', 'slug', 'tenant_code', 'tenantCode']) || ''),
    status: tenantStatus === 'deactivated' || tenantStatus === 'inactive' || tenantStatus === 'disabled' ? 'deactivated' : 'active',
    created_at: pick(row, ['created_at', 'createdAt']) || null,
    contact_email: pick(row, ['contact_email', 'contactEmail', 'email']) || pick(admin, ['email']) || null,
    contact_phone: pick(row, ['contact_phone', 'contactPhone', 'phone']) || pick(admin, ['phone']) || null,
    plan_code: plan.plan_code,
    plan_name: plan.plan_name,
    sub_status: subStatus || null,
    ...datesOf(row, sub),
    billing_period: pick(sub, ['billing_period', 'billingPeriod', 'interval']) || pick(row, ['billing_period', 'billingPeriod']) || null,
    provider: pick(sub, ['provider']) || pick(row, ['provider']) || null,
    last_payment_id: pick(sub, ['last_payment_id', 'lastPaymentId']) || null,
    ...money,
    admin_name: pick(row, ['admin_name', 'adminName', 'owner_name', 'ownerName']) || pick(admin, ['name', 'full_name', 'fullName']) || null,
    admin_email: pick(row, ['admin_email', 'adminEmail', 'owner_email', 'ownerEmail']) || pick(admin, ['email']) || null,
    admin_phone: pick(row, ['admin_phone', 'adminPhone']) || pick(admin, ['phone']) || null,
    users: Number(pick(row, ['users', 'user_count', 'userCount']) ?? 0) || 0,
    patients: Number(pick(row, ['patients', 'pets', 'pet_count', 'petCount']) ?? 0) || 0,
    address: pick(row, ['address']) || null,
    gstin: pick(row, ['gstin', 'gst']) || null,
  }
}

export function normalizeSubscription(row: any) {
  const tenant = row?.tenant && typeof row.tenant === 'object' ? row.tenant : {}
  const plan = planOf(row, row)
  const money = moneyOf(row, row)
  return {
    id: String(pick(row, ['id', 'subscription_id', 'subscriptionId']) || pick(tenant, ['id']) || ''),
    hospital_id: String(pick(row, ['tenant_id', 'tenantId', 'business_id', 'hospital_id', 'hospitalId']) || pick(tenant, ['id', 'tenant_id']) || ''),
    hospital_name: pick(row, ['tenant_name', 'tenantName', 'business_name', 'hospital_name']) || pick(tenant, ['name']) || null,
    hospital_code: pick(row, ['tenant_code', 'tenantCode', 'code']) || pick(tenant, ['code', 'slug']) || null,
    plan_code: plan.plan_code,
    plan_name: plan.plan_name,
    sub_status: canonStatus(pick(row, ['status', 'sub_status', 'subscription_status'])) || null,
    billing_period: pick(row, ['billing_period', 'billingPeriod']) || null,
    provider: pick(row, ['provider']) || null,
    ...datesOf(row, row),
    ...money,
  }
}

export function normalizeEvent(row: any, parent?: any) {
  const money = moneyOf(row, row)
  return {
    id: String(pick(row, ['id', 'event_id', 'eventId']) || `${pick(row, ['event_type', 'eventType', 'type']) || 'event'}-${pick(row, ['received_at', 'receivedAt', 'created_at', 'createdAt']) || ''}`),
    hospital_id: String(pick(row, ['tenant_id', 'tenantId', 'hospital_id', 'hospitalId']) || pick(parent, ['hospital_id', 'tenant_id', 'tenantId']) || ''),
    hospital_name: pick(row, ['tenant_name', 'tenantName', 'hospital_name', 'business_name']) || pick(parent, ['hospital_name', 'tenant_name', 'name']) || null,
    hospital_code: pick(row, ['tenant_code', 'code']) || pick(parent, ['hospital_code', 'code']) || null,
    provider: pick(row, ['provider']) || pick(parent, ['provider']) || null,
    event_type: String(pick(row, ['event_type', 'eventType', 'type', 'name']) || 'event'),
    received_at: pick(row, ['received_at', 'receivedAt', 'created_at', 'createdAt', 'at']) || null,
    plan_code: pick(row, ['plan_code', 'planCode']) || pick(parent, ['plan_code', 'planCode']) || null,
    currency: money.currency,
    amount: money.amount,
    amount_in_inr: money.amount_in_inr,
  }
}

export function normalizePayment(row: any) {
  const money = moneyOf(row, row)
  const statusRaw = String(pick(row, ['status']) || 'captured').toLowerCase()
  const status = statusRaw === 'paid' || statusRaw === 'succeeded' ? 'captured' : statusRaw === 'refund' ? 'refunded' : statusRaw
  return {
    id: String(pick(row, ['id', 'payment_id', 'paymentId']) || ''),
    hospital_id: String(pick(row, ['tenant_id', 'tenantId', 'hospital_id', 'hospitalId', 'business_id']) || ''),
    hospital_name: pick(row, ['tenant_name', 'tenantName', 'hospital_name', 'business_name', 'name']) || null,
    hospital_code: pick(row, ['tenant_code', 'tenantCode', 'hospital_code', 'code']) || null,
    plan_code: pick(row, ['plan_code', 'planCode']) || (typeof row?.plan === 'string' ? row.plan : pick(row?.plan, ['code'])) || null,
    plan_name: pick(row, ['plan_name', 'planName']) || null,
    billing_period: pick(row, ['billing_period', 'billingPeriod']) || null,
    ...money,
    status,
    provider: pick(row, ['provider']) || null,
    provider_order_id: pick(row, ['provider_order_id', 'providerOrderId', 'order_id', 'orderId']) || null,
    provider_payment_id: pick(row, ['provider_payment_id', 'providerPaymentId', 'payment_id', 'paymentId']) || null,
    paid_at: pick(row, ['paid_at', 'paidAt', 'created_at', 'createdAt']) || null,
    created_at: pick(row, ['created_at', 'createdAt']) || null,
    current_period_start: pick(row, ['current_period_start', 'currentPeriodStart']) || null,
    current_period_end: pick(row, ['current_period_end', 'currentPeriodEnd']) || null,
  }
}

export function collectEvents(subsRaw: any, tenantsRaw: any) {
  const out: ReturnType<typeof normalizeEvent>[] = []
  for (const e of asList(subsRaw, ['events'])) out.push(normalizeEvent(e))
  for (const e of asList(tenantsRaw, ['events'])) out.push(normalizeEvent(e))
  for (const s of asList(subsRaw, ['subscriptions', 'items'])) {
    const parent = normalizeSubscription(s)
    for (const e of (Array.isArray(s?.events) ? s.events : [])) out.push(normalizeEvent(e, parent))
  }
  const seen = new Set<string>()
  return out.filter(e => {
    if (!e.id || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  }).sort((a, b) => String(b.received_at || '').localeCompare(String(a.received_at || '')))
}

export function statsFromTenants(rows: ReturnType<typeof normalizeTenant>[]) {
  const stats = {total: rows.length, trial: 0, active: 0, held: 0, expired: 0, past_due: 0, plan_clinic: 0, plan_basic: 0, plan_ai: 0, paid_via_razorpay: 0}
  const plans = new Map<string, {code: string; name: string; count: number}>()
  for (const h of rows) {
    if (h.sub_status === 'trialing') stats.trial++
    else if (h.sub_status === 'active') stats.active++
    else if (h.sub_status === 'on_hold') stats.held++
    else if (h.sub_status === 'past_due') stats.past_due++
    else if (h.sub_status === 'expired' || h.sub_status === 'cancelled') stats.expired++
    if (h.plan_code === 'clinic') stats.plan_clinic++
    if (h.plan_code === 'basic') stats.plan_basic++
    if (h.plan_code === 'ai_engage') stats.plan_ai++
    if (h.provider && h.last_payment_id) stats.paid_via_razorpay++
    const code = h.plan_code || 'unknown'
    const cur = plans.get(code) || {code, name: h.plan_name || code, count: 0}
    cur.count++
    if (h.plan_name) cur.name = h.plan_name
    plans.set(code, cur)
  }
  return {stats, plan_counts: [...plans.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))}
}

export function filterTenants(rows: ReturnType<typeof normalizeTenant>[], q: {q?: string; status?: string; plan?: string}) {
  const search = String(q.q || '').trim().toLowerCase()
  const status = q.status ? canonStatus(q.status) : ''
  const plan = String(q.plan || '').trim().toLowerCase()
  return rows.filter(h => {
    if (status && h.sub_status !== status) return false
    if (plan && String(h.plan_code || '').toLowerCase() !== plan && String(h.plan_name || '').toLowerCase() !== plan) return false
    if (!search) return true
    const blob = [h.name, h.code, h.admin_email, h.admin_name, h.contact_email].join(' ').toLowerCase()
    return blob.includes(search)
  })
}

function paidRow(status: string) { return PAID.has(String(status || '').toLowerCase()) || status === 'captured' }

export function rollupPayments(payments: ReturnType<typeof normalizePayment>[]) {
  const map = new Map<string, {currency: string; amount: number; amount_in_inr: number; count: number; missing_inr: number}>()
  let paid_inr = 0
  let missing_inr = 0
  let paid = 0
  let failed = 0
  let created = 0
  for (const p of payments) {
    if (p.status === 'failed') failed++
    else if (p.status === 'created') created++
    if (!paidRow(p.status)) continue
    paid++
    const cur = currencyCode(p.currency)
    const amount = moneyNumber(p.amount) ?? 0
    const inr = moneyNumber(p.amount_in_inr)
    const row = map.get(cur) || {currency: cur, amount: 0, amount_in_inr: 0, count: 0, missing_inr: 0}
    row.amount = Math.round((row.amount + amount) * 100) / 100
    row.count++
    if (inr == null) { row.missing_inr++; missing_inr++ }
    else {
      row.amount_in_inr = Math.round((row.amount_in_inr + inr) * 100) / 100
      paid_inr = Math.round((paid_inr + inr) * 100) / 100
    }
    map.set(cur, row)
  }
  return {
    total: payments.length,
    created,
    paid,
    failed,
    paid_inr,
    missing_inr,
    by_currency: [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  }
}

function explicitRollup(raw: any, payments: ReturnType<typeof normalizePayment>[]) {
  const computed = rollupPayments(payments)
  const source = raw?.revenue && typeof raw.revenue === 'object' ? raw.revenue : raw
  const listed = asList(source, ['by_currency', 'byCurrency', 'currency_totals', 'currencies', 'totals'])
  const by = listed.map((row: any) => {
    const currency = currencyCode(pick(row, ['currency', 'code']))
    const amount = moneyNumber(pick(row, ['amount', 'total', 'original'])) ?? 0
    let amount_in_inr = moneyNumber(pick(row, ['amount_in_inr', 'amountInInr', 'inr', 'amount_inr']))
    if (amount_in_inr == null && currency === 'INR') amount_in_inr = amount
    return {currency, amount, amount_in_inr: amount_in_inr ?? 0, count: Number(pick(row, ['count', 'n']) ?? 0) || 0, missing_inr: amount_in_inr == null && currency !== 'INR' ? 1 : 0}
  }).filter(r => r.currency)
  const totalInr = moneyNumber(pick(source, ['total_amount_in_inr', 'totalAmountInInr', 'totals_in_inr', 'paid_inr', 'total_in_inr', 'totalInInr']))
  if (!by.length && totalInr == null) return computed
  const paid_inr = totalInr ?? by.reduce((s, r) => s + (r.amount_in_inr || 0), 0)
  return {
    ...computed,
    paid_inr: Math.round(paid_inr * 100) / 100,
    by_currency: by.length ? by : computed.by_currency,
    missing_inr: by.length ? by.reduce((s, r) => s + r.missing_inr, 0) : computed.missing_inr,
  }
}

function overlaySubs(tenants: ReturnType<typeof normalizeTenant>[], subs: ReturnType<typeof normalizeSubscription>[]) {
  const byId = new Map(subs.filter(s => s.hospital_id).map(s => [s.hospital_id, s]))
  return tenants.map(t => {
    const s = byId.get(t.id)
    if (!s) return t
    return {
      ...t,
      plan_code: s.plan_code || t.plan_code,
      plan_name: s.plan_name || t.plan_name,
      sub_status: s.sub_status || t.sub_status,
      billing_period: s.billing_period || t.billing_period,
      provider: s.provider || t.provider,
      trial_started_at: s.trial_started_at || t.trial_started_at,
      trial_ends_at: s.trial_ends_at || t.trial_ends_at,
      current_period_start: s.current_period_start || t.current_period_start,
      current_period_end: s.current_period_end || t.current_period_end,
      currency: s.currency || t.currency,
      amount: s.amount ?? t.amount,
      amount_in_inr: s.amount_in_inr ?? t.amount_in_inr,
      amount_inr: s.amount_in_inr ?? t.amount_in_inr,
    }
  })
}

const NOT_CONFIGURED = 'TailDesk is not configured. Set TAILDESK_API_URL and TAILDESK_PLATFORM_API_KEY.'

function notConfigured(extra: {hospital?: null} = {}) {
  return {
    ...extra,
    product: 'taildesk' as const,
    configured: false,
    message: NOT_CONFIGURED,
    hospitals: [],
    stats: {total: 0, trial: 0, active: 0, held: 0, expired: 0, past_due: 0, plan_clinic: 0, plan_basic: 0, plan_ai: 0, paid_via_razorpay: 0},
    plan_counts: [],
    payments: [],
    events: [],
    revenue: {total: 0, created: 0, paid: 0, failed: 0, paid_inr: 0, missing_inr: 0, by_currency: [] as {currency: string; amount: number; amount_in_inr: number; count: number; missing_inr: number}[]},
    upstreamError: undefined as string | undefined,
  }
}

async function bundle(query: URLSearchParams) {
  if (!taildeskCreds()) return {configured: false as const, error: NOT_CONFIGURED}
  const [tenantsR, subsR, revR] = await Promise.allSettled([
    tdGet('/api/platform/v1/tenants', query),
    tdGet('/api/platform/v1/subscriptions', query),
    tdGet('/api/platform/v1/revenue', query),
  ])
  const errors = [tenantsR, subsR, revR].flatMap(r => r.status === 'rejected' ? [scrub(r.reason instanceof Error ? r.reason.message : 'TailDesk request failed', taildeskCreds()?.key || '')] : [])
  if (tenantsR.status === 'rejected' && subsR.status === 'rejected' && revR.status === 'rejected') {
    return {configured: true as const, error: errors[0] || 'TailDesk platform API unreachable', tenants: [], subs: [], payments: [], events: [], revenueRaw: null}
  }
  const tenantsRaw = tenantsR.status === 'fulfilled' ? tenantsR.value : null
  const subsRaw = subsR.status === 'fulfilled' ? subsR.value : null
  const revRaw = revR.status === 'fulfilled' ? revR.value : null
  const tenants = overlaySubs(
    asList(tenantsRaw, ['tenants', 'businesses', 'hospitals', 'items']).map(normalizeTenant).filter(t => t.id),
    asList(subsRaw, ['subscriptions', 'items']).map(normalizeSubscription),
  )
  const payments = asList(revRaw, ['payments', 'charges', 'rows', 'items']).map(normalizePayment).filter(p => p.id || p.hospital_id)
  const events = collectEvents(subsRaw, tenantsRaw)
  return {configured: true as const, error: errors[0] || '', tenants, payments, events, revenueRaw: revRaw}
}

function filterPayments(payments: ReturnType<typeof normalizePayment>[], q: URLSearchParams) {
  const search = (q.get('q') || '').trim().toLowerCase()
  const status = (q.get('status') || '').trim().toLowerCase()
  const hid = q.get('hospitalId') || q.get('tenantId') || ''
  const after = q.get('after') || q.get('from') || ''
  const before = q.get('before') || q.get('to') || ''
  return payments.filter(p => {
    if (status && p.status !== status) return false
    if (hid && p.hospital_id !== hid) return false
    if (search) {
      const blob = [p.hospital_name, p.hospital_code, p.plan_code].join(' ').toLowerCase()
      if (!blob.includes(search)) return false
    }
    const when = p.paid_at || p.created_at
    if (when && after && String(when) < after) return false
    if (when && before && String(when).slice(0, 10) > before) return false
    return true
  })
}

export async function taildeskHospitalList(query: URLSearchParams) {
  if (!taildeskCreds()) return notConfigured()
  const data = await bundle(query)
  if (!data.configured) return notConfigured()
  if (!('tenants' in data)) return notConfigured()
  const all = data.tenants
  const {stats, plan_counts} = statsFromTenants(all)
  const hospitals = filterTenants(all, {q: query.get('q') || '', status: query.get('status') || '', plan: query.get('plan') || ''})
  const revenue = data.revenueRaw ? explicitRollup(data.revenueRaw, data.payments) : rollupPayments(data.payments)
  return {
    product: 'taildesk' as const,
    configured: true,
    message: data.error ? undefined : 'TailDesk data loaded.',
    upstreamError: data.error || undefined,
    hospitals,
    stats,
    plan_counts,
    paymentsConfigured: true,
    revenue,
    events: data.events.slice(0, 40),
  }
}

export async function taildeskHospitalDetail(id: string) {
  if (!taildeskCreds()) return {...notConfigured(), hospital: null}
  const data = await bundle(new URLSearchParams())
  if (!data.configured || !('tenants' in data)) return {...notConfigured(), hospital: null}
  if (data.error && data.tenants.length === 0) {
    return {product: 'taildesk' as const, configured: true, upstreamError: data.error, hospital: null, payments: [], events: []}
  }
  const hospital = data.tenants.find(t => t.id === id)
  if (!hospital) throw new HttpError(404, 'TailDesk tenant not found')
  const payments = data.payments.filter(p => p.hospital_id === id)
  const events = data.events.filter(e => e.hospital_id === id)
  return {product: 'taildesk' as const, configured: true, upstreamError: data.error || undefined, hospital, payments, events}
}

function asPaymentView(base: ReturnType<typeof notConfigured>, paymentsConfigured = false) {
  return {...base, stats: base.revenue, paymentsConfigured}
}
export async function taildeskPayments(query: URLSearchParams) {
  if (!taildeskCreds()) return asPaymentView(notConfigured())
  const data = await bundle(query)
  if (!data.configured || !('payments' in data)) return asPaymentView(notConfigured())
  const all = data.payments
  const revenue = data.revenueRaw ? explicitRollup(data.revenueRaw, all) : rollupPayments(all)
  return {
    product: 'taildesk' as const,
    configured: true,
    upstreamError: data.error || undefined,
    payments: filterPayments(all, query),
    stats: revenue,
    paymentsConfigured: true,
    events: data.events.slice(0, 40),
  }
}

export async function taildeskEvents(query: URLSearchParams) {
  if (!taildeskCreds()) return {product: 'taildesk' as const, configured: false, message: NOT_CONFIGURED, events: []}
  const data = await bundle(query)
  if (!data.configured || !('events' in data)) return {product: 'taildesk' as const, configured: false, message: NOT_CONFIGURED, events: []}
  const hid = query.get('hospitalId') || query.get('tenantId') || ''
  const events = hid ? data.events.filter(e => e.hospital_id === hid) : data.events
  return {product: 'taildesk' as const, configured: true, upstreamError: data.error || undefined, events: events.slice(0, 100)}
}
