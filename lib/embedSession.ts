/** Client helpers for the greynova.in/hms iframe. The address bar stays on greynova.in. */

export function isWebKitBrowser(ua: string, platform = '', maxTouchPoints = 0): boolean {
  // CriOS/FxiOS/EdgiOS are WebKit on iOS. Desktop/Android Chromium supports CHIPS and must not be prompted.
  if (/Chrome|Chromium|Edg\/|OPR\/|Android/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) return false
  const iPadOS = platform === 'MacIntel' && maxTouchPoints > 1
  return /iP(hone|ad|od)|CriOS|FxiOS|EdgiOS/.test(ua) || iPadOS || /Safari\//.test(ua)
}

/** Cross-origin parent (the GreyNova wrapper). Same-origin iframes are left alone. */
export function isCrossOriginEmbed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (!window.top || window.top === window.self) return false
    return window.top.location.origin !== window.location.origin
  } catch {
    return true
  }
}

/** Sent on credentialed requests so the server stores the partitioned embed cookie. */
export function embedRequestHeaders(): Record<string, string> {
  return isCrossOriginEmbed() ? {'x-hms-embed': '1'} : {}
}

/** WebKit blocks third-party cookies unless the iframe is granted storage access from a click.
 * Chromium uses the Partitioned cookie and must not be prompted. */
export async function ensureEmbedCookieAccess(): Promise<void> {
  if (typeof document === 'undefined' || !isCrossOriginEmbed()) return
  const ua = navigator.userAgent || ''
  if (!isWebKitBrowser(ua, navigator.platform, navigator.maxTouchPoints || 0)) return
  const doc = document as Document & {
    hasStorageAccess?: () => Promise<boolean>
    requestStorageAccess?: () => Promise<void>
  }
  if (!doc.requestStorageAccess) return
  try {
    if (doc.hasStorageAccess && await doc.hasStorageAccess()) return
    await doc.requestStorageAccess()
  } catch {
    throw new Error('This browser blocked the sign-in cookie inside the page. Allow cookie access when prompted, then sign in again.')
  }
}
