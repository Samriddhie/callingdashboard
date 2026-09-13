/**
 * Who is allowed to talk to this backend.
 *
 * Every data route sits behind requireAuth. Without it, anyone who knew the
 * URL could read every customer's name, phone number and spend straight off
 * /api/crm/customers — CORS does not stop that, it only stops other websites'
 * JavaScript from reading the reply.
 *
 * The session is a signed cookie rather than a token in localStorage. HttpOnly
 * keeps page scripts from reading it, and the HMAC signature means the browser
 * can carry it but cannot forge or edit it. node:crypto does the signing, so
 * there is no extra dependency to trust.
 */
import crypto from 'node:crypto'

const COOKIE_NAME = 'calldesk_session'
// Long enough for a calling shift, short enough that a forgotten laptop does
// not stay signed in for days.
const SESSION_HOURS = 12

// Vercel counts as production whatever NODE_ENV says: every deployment there,
// previews included, is reachable from the internet, and a random per-instance
// secret would sign people out whenever a request lands on a new instance.
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)

// Locally a random secret per run is fine: restarting the server just signs
// everyone out. In production that would sign people out on every deploy, so a
// real SESSION_SECRET is required there (see configProblems).
const SECRET =
  process.env.SESSION_SECRET || (IS_PRODUCTION ? '' : crypto.randomBytes(32).toString('hex'))

// Only when the website and the backend live on different domains. Browsers
// refuse cross-site cookies unless they are SameSite=None and Secure, so this
// also needs HTTPS on both sides.
const CROSS_SITE = (process.env.COOKIE_SAMESITE || '').toLowerCase() === 'none'

/**
 * A name-only sign-in for working on a laptop without Google configured. Off
 * unless asked for, and it cannot be switched on in production.
 */
export const DEV_BYPASS = !IS_PRODUCTION && process.env.AUTH_DEV_BYPASS === 'true'

/**
 * Settings a deployed server cannot run without. index.js refuses to start
 * when this returns anything: a production server with no domain check would
 * let any Google account on the internet read the customer list.
 */
export function configProblems({ googleClientId, allowedEmailDomain }) {
  if (!IS_PRODUCTION) return []
  const problems = []
  if ((process.env.SESSION_SECRET || '').length < 32) {
    problems.push('SESSION_SECRET must be at least 32 characters (openssl rand -hex 32).')
  }
  if (!googleClientId) problems.push('GOOGLE_CLIENT_ID must be set; it is the only way to sign in.')
  if (!allowedEmailDomain) {
    problems.push('ALLOWED_EMAIL_DOMAIN must be set, or any Google account could sign in.')
  }
  return problems
}

const signature = (payload) =>
  crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')

function encodeSession({ email, name }) {
  const payload = Buffer.from(
    JSON.stringify({
      email: email || '',
      name: name || '',
      exp: Date.now() + SESSION_HOURS * 3600_000,
    })
  ).toString('base64url')
  return `${payload}.${signature(payload)}`
}

function decodeSession(token) {
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return null

  const given = Buffer.from(sig)
  const expected = Buffer.from(signature(payload))
  // Constant-time, so the comparison cannot be used to guess a signature byte by byte.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return session.exp > Date.now() ? session : null
  } catch {
    return null
  }
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=')
    if (at > -1 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return ''
}

function cookie(req, value, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${CROSS_SITE ? 'None' : 'Lax'}`,
    // req.secure reflects the real HTTPS connection because index.js trusts the proxy.
    CROSS_SITE || req.secure ? 'Secure' : null,
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ')
}

export function startSession(req, res, user) {
  res.append('Set-Cookie', cookie(req, encodeSession(user), SESSION_HOURS * 3600))
}

export function endSession(req, res) {
  res.append('Set-Cookie', cookie(req, '', 0))
}

/** The signed-in person, or null. */
export function sessionUser(req) {
  const session = decodeSession(readCookie(req, COOKIE_NAME))
  return session ? { email: session.email, name: session.name } : null
}

export function requireAuth(req, res, next) {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Sign in to continue.' })
  req.user = user
  next()
}
