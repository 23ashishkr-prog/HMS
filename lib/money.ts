/** Currency display shared by the platform console. No FX rates — INR equivalent comes from stored amount_in_inr. */

export function moneyNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function currencyCode(v: unknown, fallback = 'INR'): string {
  const s = String(v || '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(s) ? s : fallback
}

export function formatMoney(amount: unknown, currency?: string | null): string {
  const n = moneyNumber(amount)
  if (n == null) return '—'
  const cur = currencyCode(currency)
  try {
    return new Intl.NumberFormat('en-IN', {style: 'currency', currency: cur, maximumFractionDigits: 2}).format(n)
  } catch {
    return `${cur} ${n.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
  }
}

/** Original amount in `currency`, plus INR equivalent when the original is not INR. */
export function moneyPair(row: {amount?: unknown; amount_inr?: unknown; amount_in_inr?: unknown; currency?: unknown}) {
  const currency = currencyCode(row.currency)
  const original = moneyNumber(row.amount != null ? row.amount : row.amount_inr)
  const inr = moneyNumber(row.amount_in_inr) ?? (currency === 'INR' ? original : null)
  return {currency, original, inr}
}
