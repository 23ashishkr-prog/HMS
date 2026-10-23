/** @type {import('next').NextConfig} */
// https://greynova.in/hms/ embeds this app. CSP frame-ancestors is the allowlist.
// X-Frame-Options is omitted on purpose: SAMEORIGIN would block that embed even
// when frame-ancestors lists greynova.in (some browsers apply the stricter header).
const securityHeaders = [
  {key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://greynova.in https://www.greynova.in"},
]

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{source: '/:path*', headers: securityHeaders}]
  },
}

export default nextConfig
