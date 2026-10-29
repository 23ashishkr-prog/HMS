import {appHomePath, basePath} from './basePath'

/** Only allow same-origin relative paths. Reject protocol-relative and absolute URLs.
 *  Bare "/" and bare "/hms" become the role-neutral app home (/dashboard), never the marketing page. */
export function safeAppPath(redirect: unknown, fallback = appHomePath): string {
  if (typeof redirect !== 'string') return fallback
  let t = redirect.trim()
  if (!t.startsWith('/') || t.startsWith('//') || t.includes('://')) return fallback
  if (t.includes('\\') || /[\s<>"']/.test(t)) return fallback
  if (t === basePath || t === basePath + '/') return appHomePath
  if (t.startsWith(basePath + '/')) t = t.slice(basePath.length) || appHomePath
  if (t === '/' || t === '') return appHomePath
  return t
}
