import { EMPTY_DB, SCHEMA_VERSION, makeCat, makeOrder, newId } from './schema.js'

export const STORAGE_KEY = 'calldesk.data.v2'
export const LEGACY_KEY = 'calldesk.data.v1'
export const SESSION_KEY = 'calldesk.session'

const COLLECTIONS = [
  'users',
  'customers',
  'cats',
  'orders',
  'calls',
  'noteEntries',
  'infoEntries',
  'tickets',
]

function normalize(parsed) {
  const db = { version: SCHEMA_VERSION }
  COLLECTIONS.forEach((key) => {
    db[key] = Array.isArray(parsed?.[key]) ? parsed[key] : []
  })
  return db
}

/**
 * v1 kept one flat customer row with `orderId`, a comma-joined `catNames` string
 * and grams-per-day. Split it into the normalized tables so nobody loses the data
 * they already typed in.
 */
function migrateV1(v1) {
  const db = normalize({})

  ;(v1.customers || []).forEach((old) => {
    const customer = {
      id: old.id || newId('cus'),
      customerCode: `CUST-${String(old.orderId || '').replace(/\D/g, '') || Math.floor(Math.random() * 9000) + 1000}`,
      name: old.name || '',
      phone: old.phone || '',
      signupDate: old.createdAt || new Date().toISOString(),
      status: old.status || 'active',
      productPreference: old.productPreference || 'regular',
      subscriptionInterest: Boolean(old.subscriptionInterest),
      subscriptionStatus: old.subscriptionStatus || null,
      budget: '',
      reorderExpectedAt: null,
      notes: old.notes || '',
      createdAt: old.createdAt || new Date().toISOString(),
      lastCalledAt: old.lastCalledAt || null,
    }
    db.customers.push(customer)

    // The old free-text orderId becomes a real Order record.
    if (old.orderId) {
      db.orders.push(
        makeOrder({
          customerId: customer.id,
          orderNumber: old.orderId,
          orderDate: old.createdAt || new Date().toISOString(),
          deliveryStatus: 'delivered',
        })
      )
    }

    // "Fluffy, Mochi" becomes two cat records.
    const names = (old.catNames || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)

    const legacyNote = old.consumptionPerDay ? `Legacy: ${old.consumptionPerDay} g/day (household)` : ''

    if (names.length) {
      names.forEach((name) => {
        db.cats.push(makeCat({ customerId: customer.id, name, notes: legacyNote }))
      })
    } else if (legacyNote) {
      db.cats.push(makeCat({ customerId: customer.id, name: 'Cat', notes: legacyNote }))
    }
  })

  // Old calls had a single `outcome`; map it onto the new lifecycle fields.
  ;(v1.calls || []).forEach((old) => {
    const connected = old.outcome === 'spoke'
    db.calls.push({
      id: old.id || newId('call'),
      customerId: old.customerId,
      phoneNumber: '',
      initiatedBy: null,
      initiatedByName: 'Imported',
      initiatedAt: old.callDate,
      status: connected ? 'completed' : 'notConnected',
      ringingAt: null,
      connectedAt: connected ? old.callDate : null,
      endedAt: old.callDate,
      durationSec: 0,
      notConnectedReason: old.outcome === 'noAnswer' ? 'noAnswer' : old.outcome === 'voicemail' ? 'voicemail' : null,
      disposition: old.outcome === 'callLater' ? 'callback' : connected ? 'other' : null,
      notes: old.notes || '',
      completedAt: old.callDate,
    })
  })

  ;(v1.tickets || []).forEach((old) => db.tickets.push({ ...old }))

  return db
}

export function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalize(JSON.parse(raw))

    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const migrated = migrateV1(JSON.parse(legacy))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return migrated
    }

    return { ...EMPTY_DB }
  } catch (err) {
    console.error('Could not read saved data, starting fresh.', err)
    return { ...EMPTY_DB }
  }
}

export function saveDb(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (err) {
    console.error('Could not save data.', err)
  }
}

export function loadSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

export function saveSession(userId) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
