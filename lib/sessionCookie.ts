import {basePath} from './basePath'

function serialize(name: string, value: string, opts: {secure: boolean; sameSite: 'lax' | 'strict'; path: string; maxAge: number}): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    opts.secure ? 'Secure' : '',
    'HttpOnly',
    `SameSite=${opts.sameSite}`,
  ].filter(Boolean).join('; ')
}

/** First-party session cookies. Path is /hms so they are sent on greynova.in/hms and on the Vercel host under /hms. */
export type SessionCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'lax' | 'strict'
  path: string
  maxAge: number
}

export function sessionCookieOptions(
  maxAge: number,
  opts: {sameSite?: 'lax' | 'strict'; nodeEnv?: string} = {},
): SessionCookieOptions {
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? ''
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: opts.sameSite ?? 'lax',
    path: basePath,
    maxAge,
  }
}

export function serializeSessionCookie(name: string, value: string, maxAge: number, sameSite: 'lax' | 'strict' = 'lax', nodeEnv?: string): string {
  const opts = sessionCookieOptions(maxAge, {sameSite, nodeEnv})
  return serialize(name, value, opts)
}

/** Expire a pre-basePath cookie stored at Path=/. Browsers keep Path=/ and Path=/hms as separate cookies. */
export function serializeLegacyClear(name: string, sameSite: 'lax' | 'strict' = 'lax', nodeEnv?: string): string {
  const env = nodeEnv ?? process.env.NODE_ENV ?? ''
  return serialize(name, '', {secure: env === 'production', sameSite, path: '/', maxAge: 0})
}

/** Write the /hms cookie and clear the legacy Path=/ cookie of the same name. */
export function applySessionCookie(res: Response, name: string, value: string, maxAge: number, sameSite: 'lax' | 'strict' = 'lax') {
  res.headers.append('set-cookie', serializeSessionCookie(name, value, maxAge, sameSite))
  res.headers.append('set-cookie', serializeLegacyClear(name, sameSite))
}
