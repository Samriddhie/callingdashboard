import { apiFetch } from './api.js'

/**
 * Note → structured fields, two ways:
 *
 *  - extractFromNoteAI(): sends the note to the backend, which calls Claude
 *    and returns the same shape as the rule-based version below.
 *  - extractFromNoteRules(): the original pattern-matching version. Kept as
 *    a live fallback, not just an artifact — if the backend is down or
 *    ANTHROPIC_API_KEY isn't set, the app should still extract *something*
 *    instead of the review panel silently going empty mid-call.
 *
 * extractFromNote() (the export everything else imports) tries AI first and
 * falls back to rules on any failure. Call sites just need one change: it's
 * async now, where the rule-based version used to return synchronously.
 *
 * Shape, unchanged either way:
 *   [{ key, target, label, value, display, snippet, confidence }]
 */

export async function extractFromNoteAI(rawText, context = {}) {
  const text = (rawText || '').trim()
  if (!text) return []

  const res = await apiFetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      context: { cats: (context.cats || []).map((c) => ({ name: c.name })) },
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Extraction request failed (${res.status})`)
  }

  const body = await res.json()
  return Array.isArray(body.fields) ? body.fields : []
}

// Brands worth recognising in the Indian cat-food market.
const KNOWN_BRANDS = [
  'Whiskas', 'Royal Canin', 'Sheba', 'Me-O', 'Meo', 'Drools', 'Purepet', 'Farmina',
  'Orijen', 'Acana', 'Kit Cat', 'Applaws', 'Signature', 'Friskies', 'Fancy Feast',
  'Temptations', 'Arden Grange', 'Blue Buffalo', 'Purina', 'Pedigree', 'Savory',
  'Let’s Bite', 'Lets Bite', 'Cat Food',
]

const CONFIDENCE = { high: 'high', medium: 'medium', low: 'low' }

function snippetAround(text, index, length) {
  const start = Math.max(0, index - 24)
  const end = Math.min(text.length, index + length + 24)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

export function extractFromNoteRules(rawText, context = {}) {
  const text = (rawText || '').trim()
  if (!text) return []

  const found = []
  const push = (item) => {
    // First match per key wins — avoids five competing guesses for one field.
    if (!found.some((f) => f.key === item.key)) found.push(item)
  }

  /* ---- previous brand ------------------------------------------------ */
  const brandHit = KNOWN_BRANDS.map((brand) => {
    const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    const m = re.exec(text)
    return m ? { brand, index: m.index, match: m[0] } : null
  })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)[0]

  if (brandHit) {
    // "was on Whiskas" / "switched from Whiskas" reads as a previous brand;
    // a bare brand mention is weaker evidence.
    const before = text.slice(Math.max(0, brandHit.index - 40), brandHit.index).toLowerCase()
    const isPrevious = /(was|previously|earlier|before|used to|switched from|shifted from|coming from|feeding|fed|on)\s*$|(from|using)\s*$/.test(
      before.trim() + ' '
    )
    // retired: no column on screen for previousBrand
    void 0
  }

  /* ---- packets per day ----------------------------------------------- */
  const packets = /(\d+(?:\.\d+)?)\s*(?:packets?|sachets?|pouch(?:es)?)\s*(?:a|per|\/|each)?\s*day/i.exec(text)
  if (packets) {
    push({
      key: 'packetsPerDay',
      target: 'customer',
      section: 'General food experience',
      label: 'Wet food packets a day',
      value: packets[1],
      display: `${packets[1]} packet${Number(packets[1]) === 1 ? '' : 's'}/day`,
      snippet: snippetAround(text, packets.index, packets[0].length),
      confidence: CONFIDENCE.high,
    })
  } else {
    const grams = /(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\s*(?:a|per|\/|each)?\s*day/i.exec(text)
    if (grams) {
      push({
        key: 'packetsPerDay',
        target: 'customer',
        section: 'General food experience',
        label: 'Wet food packets a day',
        value: grams[1],
        display: `${grams[1]} g/day — confirm the unit`,
        snippet: snippetAround(text, grams.index, grams[0].length),
        confidence: CONFIDENCE.low,
      })
    }
  }

  /* ---- eats / doesn't eat -------------------------------------------- */
  const refuses = /\b(?:doesn'?t|does not|won'?t|will not|not)\s+(?:eat|like|touch|finish|take)\b|\brefus(?:es|ed|ing)\b|\bspit(?:s|ted)? (?:it )?out\b|\bhates?\b/i.exec(text)
  const enjoys = /\b(?:loves?|likes?|enjoys?|finishes(?: it)?|gobbles?|eats it (?:well|happily)|happily eats|licked (?:it )?clean)\b/i.exec(text)

  if (refuses && (!enjoys || refuses.index < enjoys.index)) {
    push({
      key: 'trueHuntAcceptability',
      target: 'cat',
      section: 'TrueHunt food experience',
      label: 'Did your cat like the food?',
      value: 'didntLike',
      display: 'No',
      snippet: snippetAround(text, refuses.index, refuses[0].length),
      confidence: CONFIDENCE.high,
    })
  } else if (enjoys) {
    push({
      key: 'trueHuntAcceptability',
      target: 'cat',
      section: 'TrueHunt food experience',
      label: 'Did your cat like the food?',
      value: 'liked',
      display: 'Yes',
      snippet: snippetAround(text, enjoys.index, enjoys[0].length),
      confidence: CONFIDENCE.high,
    })
  }

  /* ---- cat name ------------------------------------------------------ */
  const knownCats = (context.cats || []).map((c) => c.name).filter(Boolean)
  const namedCat =
    /\b(?:cat|kitty|kitten)\s+(?:is\s+)?(?:named|called)\s+([A-Z][a-z]{1,15})\b/.exec(text) ||
    /\bmy\s+cat\s+([A-Z][a-z]{1,15})\b/.exec(text) ||
    /\b([A-Z][a-z]{1,15})\s+(?:loves|likes|eats|doesn'?t|won'?t|refuses|finishes|hates|was on|is on|used to)\b/.exec(
      text
    )

  if (namedCat) {
    const name = namedCat[1]
    const alreadyKnown = knownCats.some((n) => n.toLowerCase() === name.toLowerCase())
    if (!alreadyKnown) {
      push({
        key: 'catName',
        target: 'cat',
        section: 'Cats',
        label: 'Cat name',
        value: name,
        display: name,
        snippet: snippetAround(text, namedCat.index, namedCat[0].length),
        confidence: CONFIDENCE.medium,
      })
    }
  }

  /* ---- given as a treat ---------------------------------------------- */
  const treat = /\b(?:as|like)\s+a\s+treat\b|\btreat\s+only\b|\bonly\s+as\s+a?\s*treat\b/i.exec(text)
  if (treat) {
    // retired: no column on screen for productPreference
    void 0
  }

  /* ---- subscription interest ----------------------------------------- */
  const sub = /\bsubscri\w*/i.exec(text)
  if (sub) {
    const negated = /\bnot\s+interested\s+in\s+subscri|\bno\s+subscri|\bdon'?t\s+want\s+(?:a\s+)?subscri/i.test(text)
    // retired: no column on screen for subscriptionInterest
    void 0
  }

  /* ---- budget --------------------------------------------------------- */
  const budget =
    /(?:budget|around|about|upto|up to|max(?:imum)?|within)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*(\d[\d,]{1,7})/i.exec(text) ||
    /(?:₹|rs\.?|inr)\s*(\d[\d,]{1,7})/i.exec(text)
  if (budget) {
    const clean = budget[1].replace(/,/g, '')
    // retired: no column on screen for budget
    void 0
  }

  /* ---- reorder timing -------------------------------------------------- */
  const reorder = /\b(?:reorder|re-order|buy|order|purchase|take|want)\w*\s+(?:it\s+)?(?:again\s+)?(?:in|after|next)\s+(?:(\d+)\s+)?(day|week|month)s?\b/i.exec(text)
  if (reorder) {
    const n = Number(reorder[1] || 1)
    const unit = reorder[2].toLowerCase()
    const date = new Date()
    if (unit === 'day') date.setDate(date.getDate() + n)
    if (unit === 'week') date.setDate(date.getDate() + n * 7)
    if (unit === 'month') date.setMonth(date.getMonth() + n)

    // retired: no column on screen for reorderExpectedAt
    void 0
  }

  return found
}

/**
 * What CallModal actually calls. AI first — it reads more of what people
 * naturally type than any regex list of brand names will. If the backend
 * isn't reachable (not configured yet, or momentarily down), fall back to
 * the rule-based extractor rather than leaving the agent with nothing.
 */
export async function extractFromNote(rawText, context = {}) {
  try {
    return await extractFromNoteAI(rawText, context)
  } catch (err) {
    console.warn('AI extraction unavailable, using rule-based fallback:', err.message)
    return extractFromNoteRules(rawText, context)
  }
}

export const CONFIDENCE_TONES = {
  high: 'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
}
