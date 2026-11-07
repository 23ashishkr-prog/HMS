/** Keep other query params and drop the param when the first tab is selected. */
export function withTab(search: string, param: string, id: string, first: string) {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const q = new URLSearchParams(raw)
  if (!id || id === first) q.delete(param)
  else q.set(param, id)
  const s = q.toString()
  return s ? '?' + s : ''
}

export function tabValue(search: string, param: string, ids: readonly string[], fallback: string) {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const v = q.get(param) || ''
  return ids.includes(v) ? v : fallback
}
