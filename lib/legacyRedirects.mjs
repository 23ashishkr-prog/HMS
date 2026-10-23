/**
 * Bookmarks from before basePath `/hms`. Matched with basePath: false so they
 * are not prefixed again. Do not use a catch-all `/:path*` — that also matches
 * `/hms/...` and loops. Each former top-level route is listed on its own.
 */
export const legacyRoots = [
  'platform',
  'auth',
  'welcome',
  'onboarding',
  'api',
  'admin',
  'appointments',
  'billing',
  'book',
  'checkin',
  'checkin-qr',
  'clinical',
  'display',
  'followup',
  'followups',
  'frontdesk',
  'insurance',
  'ipd',
  'laboratory',
  'messages',
  'opd',
  'patients',
  'pharmacy',
  'portal',
  'queue',
  'record',
  'schedules',
  'slip',
  'status',
  '_next',
  'logo.svg',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-icon.png',
  'manifest.webmanifest',
  'sw.js',
  'favicon.ico',
]

export function legacyRedirects() {
  const rules = []
  for (const root of legacyRoots) {
    const dest = root === 'favicon.ico' ? '/hms/icon.svg' : '/hms/' + root
    rules.push(
      {source: '/' + root, destination: dest, permanent: false, basePath: false},
      {source: '/' + root + '/:path*', destination: '/hms/' + root + '/:path*', permanent: false, basePath: false},
    )
  }
  return rules
}
