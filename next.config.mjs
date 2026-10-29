import {legacyRedirects} from './lib/legacyRedirects.mjs'

/** @type {import('next').NextConfig} */
// HMS is served at /hms on this host and, via a same-origin reverse proxy, under
// that same prefix on the public site. Do not strip /hms at the proxy: assets,
// routes, and cookies all live under that path.
// Framing is same-origin only. The old cross-origin iframe is not a supported sign-in path.
// Bare paths (/platform, /auth/login, …) 307 to /hms/… so old bookmarks keep working.
const securityHeaders = [
  {key: 'Content-Security-Policy', value: "frame-ancestors 'self'"},
  {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
]

const nextConfig = {
  poweredByHeader: false,
  basePath: '/hms',
  async redirects() {
    return [
      // Owner/dev visits to the bare Vercel host land on the app. GreyNova does not proxy "/".
      {source: '/', destination: '/hms/welcome', permanent: false, basePath: false},
      ...legacyRedirects(),
    ]
  },
  async headers() {
    return [
      {source: '/', headers: securityHeaders},
      {source: '/:path*', headers: securityHeaders},
    ]
  },
}

export default nextConfig
