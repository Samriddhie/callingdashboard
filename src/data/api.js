// Single source of truth for where the backend lives.
//
// Empty by default, meaning "the site this page was loaded from": in
// production the backend serves the website itself, and in development Vite
// forwards /api to it (vite.config.js). Set VITE_API_URL only when the website
// and the backend are hosted on different domains.
export const API_BASE = import.meta.env.VITE_API_URL || ''

// AuthContext listens for this and returns to the sign-in screen.
export const UNAUTHORIZED_EVENT = 'calldesk:unauthorized'

/**
 * Every request to the backend goes through here, so none can forget to send
 * the session cookie. A 401 means the session expired or never existed.
 */
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options })
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  return res
}

/**
 * Pulls every callable customer out of the CRM, a page at a time. The browser
 * never touches Postgres — `/api/crm/*` on the backend is the only door, and
 * it only reads.
 */
export async function fetchCrmCustomers({ pageSize = 500, onProgress } = {}) {
  const all = []
  let offset = 0
  let total = 0

  do {
    const res = await apiFetch(`/api/crm/customers?limit=${pageSize}&offset=${offset}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `CRM request failed (${res.status})`)
    }
    const page = await res.json()
    total = page.total
    all.push(...page.customers)
    offset += pageSize
    onProgress?.(all.length, total)
  } while (all.length < total && offset < 20000)

  return all
}

/**
 * GoKwik / KwikEngage context for one phone number: the WhatsApp thread,
 * campaign delivery, and any abandoned carts. Matched on the last 10 digits
 * server-side, because these numbers are stored in several shapes.
 */
export async function fetchEngagement(phone, { signal } = {}) {
  const res = await apiFetch(`/api/gokwik/engagement?phone=${encodeURIComponent(phone)}`, {
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `GoKwik request failed (${res.status})`)
  }
  return res.json()
}

/** A synced customer's recent Shopify orders, straight from the CRM database. */
export async function fetchCustomerOrders(sourceId, { signal } = {}) {
  const res = await apiFetch(`/api/crm/customers/${encodeURIComponent(sourceId)}/orders`, {
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Order request failed (${res.status})`)
  }
  const data = await res.json()
  return data.orders
}

/* ------------------------------------------------------------------ */
/* Segments, the calling queue, and the pre-call brief                 */
/* ------------------------------------------------------------------ */

/** What the backend has been given keys for — Shopify handle, AI, Google. */
let configPromise = null
export function fetchConfig() {
  configPromise ||= apiFetch('/api/health')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => {
      // Don't remember a failure: the server may simply not be up yet.
      configPromise = null
      return {}
    })
  return configPromise
}

/** A customer's page in Shopify admin, or null when no store is configured. */
export function shopifyCustomerUrl(store, sourceId) {
  if (!store || !sourceId) return null
  return `https://admin.shopify.com/store/${store}/customers/${sourceId}`
}

async function getJson(path, { signal } = {}) {
  const res = await apiFetch(`${path}`, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

/** The nine cohorts, with today's headcount in each. */
export async function fetchSegments({ signal } = {}) {
  const { segments } = await getJson('/api/crm/segments', { signal })
  return segments
}

/**
 * The scored calling queue. The ordering is the backend's — it weighs where
 * each customer is in their own reorder rhythm against how valuable and how
 * habitual they are, so the caller starts at the top rather than deciding.
 */
export async function fetchQueue(
  { segments = [], sort = 'priority', search = '', limit = 100, offset = 0 } = {},
  { signal } = {}
) {
  const params = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) })
  if (segments.length) params.set('segments', segments.join(','))
  if (search) params.set('search', search)
  return getJson(`/api/crm/queue?${params}`, { signal })
}

/** Which cohort this number is in now, and the ones it has moved through. */
export async function fetchSegment(phone, { signal } = {}) {
  return getJson(`/api/crm/segment?phone=${encodeURIComponent(phone)}`, { signal })
}

/** The pre-call brief: what to know, and what to ask. */
export async function fetchBrief(customer, { signal } = {}) {
  const res = await apiFetch(`/api/ai/brief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer }),
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Briefing failed (${res.status})`)
  }
  return res.json()
}
