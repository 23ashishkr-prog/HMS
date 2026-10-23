/** Public URL prefix. GreyNova reverse-proxies https://greynova.in/hms/* to this app. */
export const basePath = '/hms'

/** Prefix a root-relative path. Leave absolute, protocol-relative, hash, and already-prefixed URLs alone. */
export function withBase(path: string): string {
  if (typeof path !== 'string' || path.length === 0) return path
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path
  if (path === basePath || path.startsWith(basePath + '/') || path.startsWith(basePath + '?') || path.startsWith(basePath + '#')) return path
  if (path === '/') return basePath
  if (path.startsWith('/')) return basePath + path
  return path
}

function configuredOrigin(): string {
  const raw = (process.env.APP_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '')
  return raw.endsWith(basePath) ? raw.slice(0, -basePath.length) : raw
}

/** Origin only, no /hms suffix. */
export function publicOrigin(): string {
  return configuredOrigin()
}

/** Absolute app root, including /hms. Emails, webhooks, and OAuth redirects use this. */
export function publicOriginUrl(): string {
  return configuredOrigin() + basePath
}

/** Path for next/navigation, which adds basePath itself. Strips one leading /hms. */
export function toRouterPath(href: string): string {
  if (typeof href !== 'string' || href.length === 0) return href
  if (href === basePath) return '/'
  if (href.startsWith(basePath + '/')) return href.slice(basePath.length) || '/'
  return href
}
