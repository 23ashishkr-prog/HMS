/** Public URL prefix. GreyNova reverse-proxies https://greynova.in/hms/:path+ to this app.
 *  The bare path https://greynova.in/hms is GreyNova's marketing page, not HMS.
 *  In-app links must never resolve to exactly /hms. */
export const basePath = '/hms'
/** Staff home. With basePath this is /hms/dashboard, which the proxy forwards. */
export const appHomePath = '/dashboard'

const homePublic = basePath + appHomePath

/** Prefix a root-relative path. Bare "/" and bare "/hms" become the dashboard, not the marketing page. */
export function withBase(path: string): string {
  if (typeof path !== 'string' || path.length === 0) return path
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('#')) return path
  if (!path.startsWith('/')) return path
  if (path === '/' || path === basePath || path === basePath + '/') return homePublic
  if (path.startsWith(basePath + '?') || path.startsWith(basePath + '#')) return homePublic + path.slice(basePath.length)
  if (path.startsWith(basePath + '/')) return path
  return basePath + path
}

function configuredOrigin(): string {
  const raw = (process.env.APP_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000')).replace(/\/$/, '')
  return raw.endsWith(basePath) ? raw.slice(0, -basePath.length) : raw
}

/** Origin only, no /hms suffix. */
export function publicOrigin(): string {
  return configuredOrigin()
}

/** Absolute app root, including /hms. Emails, webhooks, and OAuth redirects append a path to this. */
export function publicOriginUrl(): string {
  return configuredOrigin() + basePath
}

/** Path for next/navigation, which adds basePath itself. Strips one leading /hms.
 *  Bare /hms becomes /dashboard so the router does not open the marketing page. */
export function toRouterPath(href: string): string {
  if (typeof href !== 'string' || href.length === 0) return href
  if (href === '/' || href === basePath || href === basePath + '/') return appHomePath
  if (href.startsWith(basePath + '/')) return href.slice(basePath.length) || appHomePath
  return href
}

/** Runs before hydration. Same rules as withBase: never navigate to bare /hms. */
export const baseBoot = `(function(){if(window.__hmsBase)return;window.__hmsBase=1;var B='/hms';var H=B+'/dashboard';function fix(u){if(typeof u!=='string'||!u)return u;if(/^[a-z][a-z0-9+.-]*:/i.test(u)||u.indexOf('//')===0||u.charAt(0)==='#')return u;if(u.charAt(0)!=='/')return u;if(u==='/'||u===B||u===B+'/')return H;if(u.indexOf(B+'?')===0||u.indexOf(B+'#')===0)return H+u.slice(B.length);if(u.indexOf(B+'/')===0)return u;return B+u}var of=window.fetch;window.fetch=function(input,init){try{if(typeof input==='string')input=fix(input);else if(input&&typeof input.url==='string'){var p=new URL(input.url,location.href);if(p.origin===location.origin){var n=fix(p.pathname);if(n!==p.pathname)input=new Request(p.origin+n+p.search+p.hash,input)}}}catch(e){}return of.call(this,input,init)};var as=Location.prototype.assign,rp=Location.prototype.replace;Location.prototype.assign=function(u){return as.call(this,fix(String(u)))};Location.prototype.replace=function(u){return rp.call(this,fix(String(u)))};document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var a=t.closest('a[href]');if(!a)return;var h=a.getAttribute('href'),f=fix(h);if(f&&f!==h)a.setAttribute('href',f)},true)})();`
