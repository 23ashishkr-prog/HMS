/** Cookie flags for HMS sessions.
 * Direct visits keep a first-party cookie (Lax, or Strict for the platform owner).
 * https://greynova.in/hms/ embeds this host in a cross-site iframe. Browsers do not
 * send Lax/Strict cookies on those requests, so /api/auth/me returned 401 after login.
 * The embed path sets SameSite=None; Secure; Partitioned (CHIPS): the cookie is stored
 * for the top-level site (greynova.in) and sent on later iframe requests. A direct
 * visit uses a different partition, so that cookie is not a general third-party cookie.
 * Local/dev stays Lax and non-Secure so http://localhost can still sign in.
 */
export type SessionCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  partitioned: boolean
  path: '/'
  maxAge: number
}

export function requestsEmbedCookie(req: Request | undefined | null): boolean {
  return req?.headers.get('x-hms-embed') === '1'
}

export function sessionCookieOptions(
  maxAge: number,
  opts: {embed?: boolean; sameSite?: 'lax' | 'strict'; nodeEnv?: string} = {},
): SessionCookieOptions {
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? ''
  if (opts.embed && nodeEnv === 'production') {
    return {httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/', maxAge}
  }
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: opts.sameSite ?? 'lax',
    partitioned: false,
    path: '/',
    maxAge,
  }
}
