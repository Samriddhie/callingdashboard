import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { OAuth2Client } from 'google-auth-library'
import {
  callQueue,
  crmConfigured,
  customerOrders,
  customerSegment,
  listCustomers,
  segmentHistory,
  segments,
  stats,
} from './crm.js'
import { engagement, gokwikStats } from './gokwik.js'
import {
  DEV_BYPASS,
  configProblems,
  endSession,
  requireAuth,
  sessionUser,
  startSession,
} from './auth.js'

const PORT = process.env.PORT || 8787
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase().trim()
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

// Vercel loads this file as a function per request (api/index.js) rather than
// starting it as a server, so there is no port to listen on there.
const ON_VERCEL = Boolean(process.env.VERCEL)

// A deployed server missing its sign-in settings must never serve data: the
// alternative is a customer list anyone could read. A long-running server
// refuses to start. On Vercel there is no start to refuse, so the function
// stays up but locks every /api route except /api/health, which says what is
// missing.
const setupNeeded = configProblems({
  googleClientId: GOOGLE_CLIENT_ID,
  allowedEmailDomain: ALLOWED_EMAIL_DOMAIN,
})
if (setupNeeded.length && !ON_VERCEL) {
  console.error('CallDesk backend refusing to start (NODE_ENV=production):')
  setupNeeded.forEach((problem) => console.error(`  ✗ ${problem}`))
  process.exit(1)
}

const app = express()
// Behind Render, a load balancer or nginx, the app sees plain HTTP. Trusting the
// first proxy lets req.secure reflect the real HTTPS connection, which decides
// whether the session cookie is marked Secure.
app.set('trust proxy', 1)
// Only matters when the website is on a different domain from this server;
// `credentials` lets that site send the session cookie.
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }))
app.use(express.json({ limit: '200kb' }))

// Locked, including sign-in: without SESSION_SECRET a session cookie could be
// forged, so no session may be issued until the settings exist.
if (setupNeeded.length) {
  app.use('/api', (req, res, next) =>
    req.path === '/health'
      ? next()
      : res.status(503).json({ error: 'This server is not set up yet.', setupNeeded })
  )
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    googleConfigured: Boolean(GOOGLE_CLIENT_ID),
    anthropicConfigured: Boolean(ANTHROPIC_API_KEY),
    // The frontend builds admin.shopify.com links from this; without it there
    // is no way to know which store an id belongs to.
    shopifyStore: process.env.SHOPIFY_STORE || null,
    crmConfigured: crmConfigured(),
    allowedEmailDomain: ALLOWED_EMAIL_DOMAIN || null,
    // Public by design: Google's button needs the client ID in the page anyway.
    // Serving it here means one setting configures both halves.
    googleClientId: GOOGLE_CLIENT_ID || null,
    authMode: setupNeeded.length
      ? 'unconfigured'
      : GOOGLE_CLIENT_ID
        ? 'google'
        : DEV_BYPASS
          ? 'dev'
          : 'unconfigured',
    // Names of missing settings only, never their values.
    setupNeeded,
  })
})

/* ------------------------------------------------------------------ */
/* Google Sign-In verification                                        */
/*                                                                      */
/* The browser gets an ID token straight from Google (see LoginScreen). */
/* That token is a claim, not proof, until something that isn't the     */
/* browser checks Google's signature on it — that's what this endpoint  */
/* does, plus the @domain allow-list.                                   */
/* ------------------------------------------------------------------ */
app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) {
    return res
      .status(500)
      .json({ error: 'Server is missing GOOGLE_CLIENT_ID — see server/.env.example' })
  }

  const { credential } = req.body || {}
  if (!credential) return res.status(400).json({ error: 'Missing credential' })

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ error: 'Google could not verify this email.' })
    }

    if (ALLOWED_EMAIL_DOMAIN && !payload.email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      return res.status(403).json({ error: `Only @${ALLOWED_EMAIL_DOMAIN} accounts can sign in.` })
    }

    const profile = {
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
      googleId: payload.sub,
    }
    startSession(req, res, profile)
    res.json(profile)
  } catch (err) {
    console.error('Google token verification failed:', err.message)
    res.status(401).json({ error: 'Could not verify Google sign-in — try again.' })
  }
})

app.get('/api/auth/me', (req, res) => {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  res.json(user)
})

app.post('/api/auth/logout', (req, res) => {
  endSession(req, res)
  res.json({ ok: true })
})

// Name-only sign-in for local development. Answers 404 unless the server was
// started with AUTH_DEV_BYPASS=true outside production, so on a deployed server
// the route behaves as if it does not exist.
app.post('/api/auth/dev', (req, res) => {
  if (!DEV_BYPASS) return res.status(404).json({ error: 'Not found' })
  const name = String(req.body?.name || '').trim().slice(0, 80)
  const email = String(req.body?.email || '').trim().slice(0, 120)
  if (!name) return res.status(400).json({ error: 'Enter your name so calls can be attributed to you.' })
  startSession(req, res, { name, email })
  res.json({ name, email })
})

/* ------------------------------------------------------------------ */
/* Everything below needs a signed-in user                             */
/*                                                                      */
/* Customer names, phone numbers, orders and spend, plus the AI routes  */
/* that cost money per call. Health and the sign-in routes above stay   */
/* open, because you need them before you have a session.              */
/* ------------------------------------------------------------------ */
app.use('/api', requireAuth)

/* ------------------------------------------------------------------ */
/* AI note extraction                                                  */
/*                                                                      */
/* Same output shape as the old rule-based extractFromNote() in         */
/* src/data/extract.js, so the review/approve UI on the frontend        */
/* doesn't need to change at all.                                       */
/* ------------------------------------------------------------------ */

// Keep this in sync with the `target`/label side of src/data/extract.js.
// Locking the model to these keys (rather than trusting whatever it
// returns) means it can't hand the frontend a field shape nothing
// downstream knows how to render or save.
/**
 * The columns a note can fill, and where each one lives on screen.
 *
 * This list is the contract: the model may only return these keys, and every
 * one of them is a field the caller can see filled in on the customer page
 * afterwards. Anything the model volunteers outside the list is dropped, so a
 * hallucinated key can never reach a record.
 */
const FIELD_META = {
  // -- Cats --------------------------------------------------------------
  catCount: { label: 'How many cats', target: 'customer', section: 'Cats' },
  catName: { label: 'Cat name', target: 'cat', section: 'Cats' },
  age: { label: 'Cat age', target: 'cat', section: 'Cats' },
  breed: { label: 'Cat breed', target: 'cat', section: 'Cats' },

  // -- TrueHunt food experience -----------------------------------------
  trueHuntAcceptability: {
    label: 'Did your cat like the food?',
    target: 'cat',
    section: 'TrueHunt food experience',
  },
  catExperience: { label: 'Any comment', target: 'cat', section: 'TrueHunt food experience' },
  overallExperience: {
    label: 'Feedback',
    target: 'customer',
    section: 'TrueHunt food experience',
  },
  benefitsNoticed: { label: 'Benefits', target: 'customer', section: 'TrueHunt food experience' },

  // -- General food experience ------------------------------------------
  feedingSplit: {
    label: 'What kind of food, and how often',
    target: 'customer',
    section: 'General food experience',
  },
  dryBrands: { label: 'Brands of dry food', target: 'customer', section: 'General food experience' },
  wetBrands: { label: 'Brands of wet food', target: 'customer', section: 'General food experience' },
  packetsPerDay: {
    label: 'Wet food packets a day',
    target: 'customer',
    section: 'General food experience',
  },
  buysFrom: { label: 'Where do they buy from', target: 'customer', section: 'General food experience' },
  catBehaviourNotes: {
    label: 'Cat behaviour, disease or habit',
    target: 'customer',
    section: 'General food experience',
  },

  // -- Household ---------------------------------------------------------
  familyInfo: {
    label: 'Customer and family information',
    target: 'customer',
    section: 'Customer and family information',
  },
}

const LIKED_LABEL = { liked: 'Yes', somewhatLiked: 'A little', didntLike: 'No' }

// Formatting is done here, not by the model, so "2" always renders the same
// way whichever route filled it in.
function buildDisplay(key, value) {
  switch (key) {
    case 'packetsPerDay':
      return `${value} packet${Number(value) === 1 ? '' : 's'} a day`
    case 'catCount':
      return `${value} cat${Number(value) === 1 ? '' : 's'}`
    case 'trueHuntAcceptability':
      return LIKED_LABEL[value] || value
    case 'dryBrands':
    case 'wetBrands':
    case 'buysFrom':
      return String(value)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .join(', ')
    default:
      return value
  }
}

function systemPrompt(context) {
  const knownCats = (context?.cats || []).map((c) => c.name).filter(Boolean)
  const today = new Date().toISOString().slice(0, 10)

  return `You extract structured facts from a cat-food call-center agent's free-text note about a customer call.

Today's date is ${today}.
Known cat names already on file for this customer: ${knownCats.length ? knownCats.join(', ') : 'none'}.

Return ONLY a JSON array (no prose, no markdown code fences). Each item:
{ "key": "...", "value": "...", "snippet": "...", "confidence": "high" | "medium" | "low" }

Allowed keys, and how to fill "value":
- catCount: how many cats the household has, as a plain number string (e.g. "2").
- catName: the cat's name, ONLY if it is not already in the known cat names above.
- age: the cat's age as the customer said it (e.g. "3 years", "8 months").
- breed: the cat's breed (e.g. "Persian", "Indian domestic (Billi)", "Tabby").
- trueHuntAcceptability: "liked" | "somewhatLiked" | "didntLike" — did the cat like the TrueHunt food.
- catExperience: what happened when the cat tried it, in the customer's words.
- overallExperience: the parent's own feedback — packaging, smell, texture, ingredients, brand, pricing.
- benefitsNoticed: any benefit they have noticed (coat, stools, energy, appetite).
- feedingSplit: what they feed and how often, across dry, wet, home made and treats.
- dryBrands: dry food brands they use, comma separated (e.g. "Whiskas, Drools").
- wetBrands: wet food brands they use, comma separated.
- packetsPerDay: wet packets a day across the household, a number string, halves allowed (e.g. "1.5").
- buysFrom: where they buy, comma separated (e.g. "Amazon, Local pet shop").
- catBehaviourNotes: any behaviour, illness, allergy or habit worth recording.
- familyInfo: who is in the household, who feeds the cat, anything worth remembering.

Rules:
- Only include a key if the note actually supports it — never guess to fill a gap.
- "snippet" must be a short excerpt copied verbatim from the note that justifies the value.
- If you're not reasonably confident, leave the field out rather than forcing a low-confidence guess.
- Output nothing but the JSON array, starting with [ and ending with ].`
}

app.post('/api/extract', async (req, res) => {
  const { text, context } = req.body || {}
  const note = (text || '').trim()
  if (!note) return res.json({ fields: [] })

  if (!ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Server is missing ANTHROPIC_API_KEY — see server/.env.example' })
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        temperature: 0,
        system: systemPrompt(context),
        messages: [{ role: 'user', content: note }],
      }),
    })

    if (!r.ok) {
      const body = await r.text()
      console.error('Anthropic API error:', r.status, body)
      return res.status(502).json({ error: 'AI extraction service failed.' })
    }

    const data = await r.json()
    const raw = (data.content || []).map((block) => block.text || '').join('').trim()
    const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()

    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error('Could not parse model output as JSON:', jsonText)
      return res.status(502).json({ error: 'AI returned an unreadable response.' })
    }
    if (!Array.isArray(parsed)) parsed = []

    const seen = new Set()
    const fields = []
    for (const item of parsed) {
      const key = item?.key
      const meta = FIELD_META[key]
      if (!meta || seen.has(key)) continue // unknown/duplicate key — ignore, don't trust it
      if (item.value == null || item.value === '') continue
      seen.add(key)
      fields.push({
        key,
        target: meta.target,
        label: meta.label,
        // Which card on the customer page this lands in, so the review can be
        // read as "here is what goes where" rather than a flat list.
        section: meta.section,
        value: String(item.value),
        display: buildDisplay(key, String(item.value)),
        snippet: item.snippet || '',
        confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
      })
    }

    res.json({ fields })
  } catch (err) {
    console.error('Extraction request failed:', err)
    res.status(500).json({ error: 'AI extraction request failed.' })
  }
})

/* ------------------------------------------------------------------ */
/* CRM (Shopify sync) — read-only                                      */
/*                                                                      */
/* The browser can't hold database credentials, so these endpoints are  */
/* the only way the frontend sees Postgres. Every one of them reads.    */
/* ------------------------------------------------------------------ */

const crmGuard = (req, res, next) =>
  crmConfigured()
    ? next()
    : res.status(503).json({ error: 'CRM database is not configured — see server/.env.example' })

app.get('/api/crm/stats', crmGuard, async (req, res) => {
  try {
    res.json(await stats())
  } catch (err) {
    console.error('CRM stats failed:', err)
    res.status(502).json({ error: 'Could not read the CRM database.' })
  }
})

app.get('/api/crm/customers', crmGuard, async (req, res) => {
  try {
    res.json(
      await listCustomers({
        limit: req.query.limit,
        offset: req.query.offset,
        search: (req.query.search || '').toString().slice(0, 80),
        withPhone: req.query.withPhone !== 'false',
      })
    )
  } catch (err) {
    console.error('CRM customers failed:', err)
    res.status(502).json({ error: 'Could not read the CRM database.' })
  }
})

/* ------------------------------------------------------------------ */
/* Pre-call brief                                                      */
/*                                                                      */
/* Two questions a caller would otherwise answer by reading five        */
/* screens: what do I need to know, and what should I ask. Both are     */
/* answered in one request — same context, half the latency and cost,   */
/* and the frontend shows them as two sections.                         */
/* ------------------------------------------------------------------ */

const BRIEF_SYSTEM = `You brief a phone agent at TrueHunt, an Indian cat food brand, in the ten seconds before they dial.

You are given everything known about one customer: their Shopify order history, the cohort they sit in, past calls and what was said on them, their cats, and feedback they have given.

Answer two questions:
1. "What should I know about this customer to make this call successful?"
2. "What are the most important things I should ask this customer?"

Return JSON only, in this shape:
{
  "summary": ["short sentence", "short sentence"],
  "questions": ["question to ask", "question to ask"]
}

Rules:
- 3 to 5 summary points, 3 to 5 questions. Fewer if the record is thin.
- Every summary point must rest on something in the data. Never invent an order, a cat, or a complaint. If the record is thin, say so plainly in one point.
- Write what matters for *this* call: where they are in their reorder rhythm, what they last complained about or praised, what is still unknown.
- Questions must be ones the data does not already answer — no asking for a cat's name that is already on file.
- Plain British English, no marketing voice, no greeting scripts. One sentence each.
- Output nothing but the JSON object.`

app.post('/api/ai/brief', async (req, res) => {
  const { customer } = req.body || {}
  if (!customer) return res.status(400).json({ error: 'Missing customer context.' })

  if (!ANTHROPIC_API_KEY) {
    return res
      .status(503)
      .json({ error: 'Server is missing ANTHROPIC_API_KEY — see server/.env.example' })
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 900,
        temperature: 0,
        system: BRIEF_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(customer) }],
      }),
    })

    if (!r.ok) {
      const body = await r.text()
      console.error('Anthropic API error:', r.status, body)
      return res.status(502).json({ error: 'The briefing service failed.' })
    }

    const data = await r.json()
    const raw = (data.content || []).map((b) => b.text || '').join('').trim()
    const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()

    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error('Could not parse brief as JSON:', jsonText)
      return res.status(502).json({ error: 'The briefing came back unreadable.' })
    }

    res.json({
      summary: (parsed.summary || []).filter((x) => typeof x === 'string').slice(0, 5),
      questions: (parsed.questions || []).filter((x) => typeof x === 'string').slice(0, 5),
    })
  } catch (err) {
    console.error('Brief failed:', err)
    res.status(502).json({ error: 'Could not reach the briefing service.' })
  }
})

app.get('/api/crm/segments', crmGuard, async (req, res) => {
  try {
    res.json({ segments: await segments() })
  } catch (err) {
    console.error('CRM segments failed:', err)
    res.status(502).json({ error: 'Could not read segments.' })
  }
})

/**
 * The scored calling queue. Answers "who first?" rather than handing back a
 * list sorted on one column and leaving the judgement to the caller.
 */
app.get('/api/crm/queue', crmGuard, async (req, res) => {
  try {
    res.json(
      await callQueue({
        segments: String(req.query.segments || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        sort: req.query.sort,
        search: req.query.search,
        limit: req.query.limit,
        offset: req.query.offset,
      })
    )
  } catch (err) {
    console.error('CRM queue failed:', err)
    res.status(502).json({ error: 'Could not build the calling queue.' })
  }
})

app.get('/api/crm/segment', crmGuard, async (req, res) => {
  try {
    const phone = req.query.phone || ''
    const [now, trail] = await Promise.all([customerSegment(phone), segmentHistory(phone)])
    res.json({ current: now, history: trail })
  } catch (err) {
    console.error('CRM segment lookup failed:', err)
    res.status(502).json({ error: 'Could not read this customer’s segment.' })
  }
})

app.get('/api/crm/customers/:id/orders', crmGuard, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Bad customer id' })
  try {
    res.json({ orders: await customerOrders(req.params.id, req.query.limit) })
  } catch (err) {
    console.error('CRM orders failed:', err)
    res.status(502).json({ error: 'Could not read the CRM database.' })
  }
})

/* ------------------------------------------------------------------ */
/* GoKwik / KwikEngage — read-only, keyed by phone number              */
/* ------------------------------------------------------------------ */

app.get('/api/gokwik/stats', crmGuard, async (req, res) => {
  try {
    res.json(await gokwikStats())
  } catch (err) {
    console.error('GoKwik stats failed:', err)
    res.status(502).json({ error: 'Could not read GoKwik data.' })
  }
})

app.get('/api/gokwik/engagement', crmGuard, async (req, res) => {
  const phone = (req.query.phone || '').toString()
  if (!phone) return res.status(400).json({ error: 'phone is required' })
  try {
    res.json(await engagement(phone, { messageLimit: req.query.messages }))
  } catch (err) {
    console.error('GoKwik engagement failed:', err)
    res.status(502).json({ error: 'Could not read GoKwik data.' })
  }
})

// An /api path nothing matched. Answered as JSON so it never falls through to
// the website's index.html below.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

/* ------------------------------------------------------------------ */
/* The website itself                                                  */
/*                                                                      */
/* After `npm run build`, this server also serves dist/, so one service */
/* is the whole app: the page and the API share an origin, and the     */
/* session cookie needs no cross-site settings.                         */
/* ------------------------------------------------------------------ */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const SERVES_WEBSITE = fs.existsSync(path.join(DIST, 'index.html'))
if (SERVES_WEBSITE) {
  app.use(express.static(DIST))
  // A single-page app: any other path is still index.html.
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

if (!ON_VERCEL) {
  app.listen(PORT, () => {
    console.log(`CallDesk backend listening on http://localhost:${PORT}`)
    console.log(
      SERVES_WEBSITE
        ? `  ✓ Serving the website from ${DIST}`
        : '  · No dist/ build found, so only the API is served (run `npm run build` in the project root).'
    )
    if (DEV_BYPASS) {
      console.warn('  ⚠ AUTH_DEV_BYPASS is on — name-only sign-in is enabled. Never set this on a deployed server.')
    }
    if (!GOOGLE_CLIENT_ID) console.warn('  ⚠ GOOGLE_CLIENT_ID not set — Google Sign-In will fail.')
    if (!ANTHROPIC_API_KEY) console.warn('  ⚠ ANTHROPIC_API_KEY not set — AI extraction will fail.')
    if (!ALLOWED_EMAIL_DOMAIN) console.warn('  ⚠ ALLOWED_EMAIL_DOMAIN not set — any Google account can sign in.')
    if (!crmConfigured()) console.warn('  ⚠ CRM_DATABASE not set — CRM endpoints will return 503.')
  })
}

export default app
