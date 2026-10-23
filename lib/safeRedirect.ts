/** Only allow same-origin relative paths. Reject protocol-relative and absolute URLs. */
export function safeAppPath(redirect: unknown, fallback = '/'): string {
  if (typeof redirect !== 'string') return fallback
  const t = redirect.trim()
  if (!t.startsWith('/') || t.startsWith('//') || t.includes('://')) return fallback
  if (t.includes('\\') || /[\s<>"']/.test(t)) return fallback
  return t
}
