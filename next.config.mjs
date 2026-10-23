/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Stop marketing shells (e.g. greynova.in/hms) from iframes that break hms_session (SameSite / third-party cookies).
  {key: 'X-Frame-Options', value: 'SAMEORIGIN'},
  {key: 'Content-Security-Policy', value: "frame-ancestors 'self'"},
]

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{source: '/:path*', headers: securityHeaders}]
  },
}

export default nextConfig
