import { catPalatability } from './schema.js'
import { isOverdue } from './format.js'

/**
 * What previous calls add up to, in sentences a caller can read in two seconds.
 *
 * These are derived rather than typed: the raw notes are already stored verbatim,
 * and nobody re-reads six months of them before dialling. The rules below are
 * deliberately conservative — each one either fires on hard evidence (a
 * disposition, a missing field, a repeated phrase) or stays quiet. A confident
 * wrong summary is worse than no summary on a live call.
 *
 * `extractInsights` is where an LLM pass would slot in later; it takes the same
 * inputs and returns the same shape, so the UI never has to care which produced
 * a given line.
 */

const RECENT = 5

// Severity order, so the cap keeps the lines that change how the call opens.
const PRIORITY = { red: 0, amber: 1, purple: 2, blue: 3, gray: 4 }
const MAX_INSIGHTS = 5

// Topics worth surfacing, and the ways people actually say them on the phone.
const TOPICS = [
  {
    key: 'palatability',
    label: 'palatability',
    sentence: 'was concerned about palatability',
    tone: 'amber',
    icon: 'ti-alert-triangle',
    re: /\b(refus\w*|didn'?t eat|not eating|stopped eating|won'?t eat|picky|fussy|doesn'?t like|spit|vomit)\b/i,
  },
  {
    key: 'price',
    label: 'price',
    sentence: 'mentioned price or budget',
    tone: 'gray',
    icon: 'ti-coin',
    re: /\b(price|pricing|costly|expensive|budget|discount|offer|cheap)\b/i,
  },
  {
    key: 'delivery',
    label: 'delivery',
    sentence: 'mentioned delivery or packaging',
    tone: 'gray',
    icon: 'ti-truck',
    re: /\b(deliver\w*|courier|shipment|shipping|late|packet tear|packaging|damaged|leak\w*)\b/i,
  },
  {
    key: 'subscription',
    label: 'subscription',
    sentence: 'discussed a subscription',
    tone: 'purple',
    icon: 'ti-refresh',
    re: /\b(subscri\w*|monthly plan|auto[- ]?ship|recurring)\b/i,
  },
  {
    key: 'health',
    label: "the cat's health",
    sentence: "mentioned the cat's health",
    tone: 'amber',
    icon: 'ti-stethoscope',
    re: /\b(vet|sick|ill|allerg\w*|stomach|loose motion|diarrh\w*|kidney|urinary)\b/i,
  },
]

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Rule-derived context. Same shape an AI pass would return. */
export function extractInsights({ customer, calls = [], notes = [], cats = [], ticket }) {
  const out = []

  const attempts = calls.filter((c) => c.status !== 'didntCall')
  const connected = calls.filter((c) => c.connectedAt)
  const recentNotes = notes.slice(0, RECENT)

  /* -- never spoken to ------------------------------------------------- */
  if (connected.length === 0) {
    out.push({
      key: 'never-connected',
      tone: attempts.length ? 'amber' : 'blue',
      icon: attempts.length ? 'ti-phone-off' : 'ti-sparkles',
      text: attempts.length
        ? `Never actually spoken to — ${plural(attempts.length, 'attempt')}, none connected.`
        : 'First call. Nothing on record yet.',
    })
  }

  /* -- what came up, and how often ------------------------------------- */
  if (recentNotes.length) {
    const scope =
      recentNotes.length === 1 ? 'On the last call' : `Across the last ${recentNotes.length} calls`

    TOPICS.forEach((topic) => {
      const hits = recentNotes.filter((n) => topic.re.test(n.rawText || ''))
      if (!hits.length) return

      const quote = (hits[0].rawText || '').trim().replace(/\s+/g, ' ')
      out.push({
        key: `topic-${topic.key}`,
        tone: topic.tone,
        icon: topic.icon,
        text: `${scope}, ${topic.sentence}${hits.length > 1 ? ` (${hits.length} times)` : ''}.`,
        quote: quote.length > 140 ? `${quote.slice(0, 140)}…` : quote,
      })
    })
  }

  /* -- palatability from the cat records, not just the words ----------- */
  const fussy = cats.filter((c) => ['picky', 'refuses'].includes(catPalatability(c)))
  if (fussy.length) {
    const named = fussy.map((c) => c.name).filter(Boolean)
    out.push({
      key: 'palatability-record',
      tone: 'amber',
      icon: 'ti-heart-off',
      text: named.length
        ? `${named.join(' and ')} logged as picky or refusing.`
        : `${plural(fussy.length, 'cat')} logged as picky or refusing.`,
    })
  }

  /* -- gaps worth closing on this call --------------------------------- */
  if (connected.length > 0) {
    if (!cats.length || cats.every((c) => !c.name?.trim())) {
      out.push({
        key: 'no-cat-name',
        tone: 'blue',
        icon: 'ti-cat',
        text: "Hasn't shared a cat name yet.",
      })
    }

    const missing = []
    if (!customer.budget) missing.push('budget')
    // Packets a day is asked once for the household now, not per cat; older
    // records still carry it on the cat, so either one counts as answered.
    const packetsKnown =
      (customer.packetsPerDay !== '' && customer.packetsPerDay != null) ||
      cats.some((c) => c.packetsPerDay !== '' && c.packetsPerDay != null)
    if (!packetsKnown) missing.push('packets/day')
    // Same story for brands: the form now asks the household which other
    // brands they feed, and the per-cat `previousBrand` only survives on
    // older records and on what note extraction picks up.
    const brandsKnown =
      (customer.otherBrands || []).length > 0 || cats.some((c) => c.previousBrand)
    if (!brandsKnown) missing.push('other brands')
    if (missing.length) {
      out.push({
        key: 'missing-fields',
        tone: 'gray',
        icon: 'ti-help-circle',
        text: `Still unknown: ${missing.join(', ')}.`,
      })
    }
  }

  /* -- promises we made ------------------------------------------------ */
  if (ticket?.status === 'pending') {
    out.push({
      key: 'callback',
      tone: isOverdue(ticket.scheduledFor) ? 'red' : 'amber',
      icon: 'ti-clock',
      text: isOverdue(ticket.scheduledFor)
        ? 'Callback is overdue — they were promised a call back.'
        : 'Callback already scheduled with this customer.',
    })
  }

  /* -- where the last conversation left off ---------------------------- */
  const lastDisposition = calls.find((c) => c.disposition)
  if (lastDisposition) {
    const said = {
      interested: 'Said they were interested to buy on the last call, but no order followed.',
      ordered: 'Last call ended in an order.',
      callback: 'Last call ended with a callback request.',
      notInterested: 'Last call ended not interested — tread carefully.',
      doNotCall: 'They asked not to be called again.',
    }[lastDisposition.disposition]
    if (said && !(lastDisposition.disposition === 'interested' && customer.ordersCount > 0)) {
      out.push({
        key: 'last-disposition',
        tone: ['notInterested', 'doNotCall'].includes(lastDisposition.disposition)
          ? 'red'
          : 'gray',
        icon: 'ti-message-2',
        text: said,
      })
    }
  }

  // Never show the same quote twice — two topics often match one sentence.
  const seenQuotes = new Set()
  out.forEach((insight) => {
    if (!insight.quote) return
    if (seenQuotes.has(insight.quote)) delete insight.quote
    else seenQuotes.add(insight.quote)
  })

  return out
    .sort((a, b) => (PRIORITY[a.tone] ?? 9) - (PRIORITY[b.tone] ?? 9))
    .slice(0, MAX_INSIGHTS)
}

export const TONES = {
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  purple: 'bg-purple-50 text-purple-800 border-purple-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
}
