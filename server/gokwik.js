import { crmQuery } from './crm.js'

/**
 * Read-only window onto the GoKwik / KwikEngage data that lands in the same
 * Postgres database as the Shopify sync: WhatsApp conversations, campaign
 * delivery logs, and abandoned carts.
 *
 * Everything here is keyed by phone number rather than by customer id — GoKwik
 * knows people by their handset, not by their Shopify id. Numbers arrive in
 * several shapes (`+919910707399`, `919910707399`, `09654964104`), so every
 * join is on the last 10 digits. Matching on the raw strings silently loses
 * most of the abandoned carts.
 */

const LAST10 = (expr) => `right(regexp_replace(${expr}, '\\D', '', 'g'), 10)`

function digits10(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

/** The WhatsApp thread, newest first. */
async function messages(last10, limit) {
  const rows = await crmQuery(
    `select message_id, direction, text, content_type, ts, status, sender_name, contact_name
     from kwik_messages
     where ${LAST10('phone')} = $1
     order by ts desc
     limit $2`,
    [last10, limit]
  )
  return rows.map((r) => ({
    id: r.message_id,
    direction: r.direction,
    text: r.text || '',
    contentType: r.content_type || 'text',
    at: r.ts ? new Date(r.ts).toISOString() : null,
    status: r.status || '',
    from: r.sender_name || r.contact_name || '',
  }))
}

/** How campaign sends to this number have landed. */
async function campaigns(last10) {
  const [row] = await crmQuery(
    `select count(*)::int as sent,
            count(*) filter (where seen_at is not null)::int as seen,
            count(*) filter (where clicked_at is not null)::int as clicked,
            count(*) filter (where failed_at is not null)::int as failed,
            max(created_at) as last_sent_at
     from kwik_message_logs
     where ${LAST10('phone')} = $1`,
    [last10]
  )
  return {
    sent: row.sent,
    seen: row.seen,
    clicked: row.clicked,
    failed: row.failed,
    lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
  }
}

/** Carts they walked away from — the most actionable thing on a call. */
async function carts(last10, limit) {
  const rows = await crmQuery(
    `select id, cart_value, cart_items, checkout_url, abandoned_at, recovered, recovered_at
     from abandoned_carts
     where ${LAST10('phone')} = $1
     order by abandoned_at desc
     limit $2`,
    [last10, limit]
  )
  return rows.map((r) => ({
    id: r.id,
    value: r.cart_value == null ? null : Number(r.cart_value),
    items: r.cart_items || '',
    checkoutUrl: r.checkout_url || '',
    abandonedAt: r.abandoned_at ? new Date(r.abandoned_at).toISOString() : null,
    recovered: Boolean(r.recovered),
    recoveredAt: r.recovered_at ? new Date(r.recovered_at).toISOString() : null,
  }))
}

/** Everything GoKwik knows about one phone number, in one round trip. */
export async function engagement(phone, { messageLimit = 15, cartLimit = 5 } = {}) {
  const last10 = digits10(phone)
  if (last10.length < 10) {
    return { matched: false, messages: [], campaigns: null, carts: [] }
  }

  const [msgs, camp, cart] = await Promise.all([
    messages(last10, Math.min(Number(messageLimit) || 15, 50)),
    campaigns(last10),
    carts(last10, Math.min(Number(cartLimit) || 5, 20)),
  ])

  return {
    matched: msgs.length > 0 || cart.length > 0 || camp.sent > 0,
    messages: msgs,
    campaigns: camp,
    carts: cart,
  }
}

/** Headline GoKwik numbers, for a dashboard tile. */
export async function gokwikStats() {
  const [row] = await crmQuery(`
    select
      (select count(*)::int from kwik_messages) as messages,
      (select count(distinct ${LAST10('phone')})::int from kwik_messages) as message_contacts,
      (select max(ts) from kwik_messages) as last_message_at,
      (select count(*)::int from abandoned_carts) as carts,
      (select count(*)::int from abandoned_carts where recovered) as carts_recovered,
      (select coalesce(sum(cart_value), 0) from abandoned_carts where not recovered) as open_cart_value,
      (select count(*)::int from kwik_message_logs) as campaign_sends,
      (select count(*)::int from kwik_message_logs where failed_at is not null) as campaign_failed
  `)

  return {
    messages: row.messages,
    messageContacts: row.message_contacts,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
    carts: row.carts,
    cartsRecovered: row.carts_recovered,
    openCartValue: Number(row.open_cart_value),
    campaignSends: row.campaign_sends,
    campaignFailed: row.campaign_failed,
  }
}
