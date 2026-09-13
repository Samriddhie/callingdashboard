import pg from 'pg'

/**
 * Read-only window onto the TrueHunt CRM Postgres database (the Shopify sync).
 *
 * Two deliberate constraints:
 *
 *  - The browser never talks to Postgres. Credentials can't live in frontend
 *    JavaScript, so every query goes through this backend, same as the
 *    Anthropic key does.
 *  - Every connection is opened read-only (`default_transaction_read_only`).
 *    This is a real business database; a calling tool has no business writing
 *    to it, and the guarantee belongs at the connection, not in review.
 */

const CONFIGURED = Boolean(process.env.CRM_DATABASE || process.env.CRM_DATABASE_URL)

const pool = CONFIGURED
  ? new pg.Pool(
      process.env.CRM_DATABASE_URL
        ? { connectionString: process.env.CRM_DATABASE_URL, max: 4 }
        : {
            host: process.env.CRM_HOST || 'localhost',
            port: Number(process.env.CRM_PORT || 5432),
            database: process.env.CRM_DATABASE,
            user: process.env.CRM_USER || undefined,
            password: process.env.CRM_PASSWORD || undefined,
            max: 4,
          }
    )
  : null

if (pool) {
  // Belt and braces: any connection this pool hands out cannot write.
  pool.on('connect', (client) => {
    client.query('SET default_transaction_read_only = on').catch(() => {})
  })
  pool.on('error', (err) => console.error('CRM pool error:', err.message))
}

export const crmConfigured = () => Boolean(pool)

export async function crmQuery(text, params) {
  if (!pool) throw new Error('CRM database is not configured — see server/.env.example')
  const res = await pool.query(text, params)
  return res.rows
}

const query = crmQuery

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

/**
 * Shopify's customer row into the shape the frontend already understands.
 * `sourceId` is what makes a re-sync update a customer rather than duplicate
 * them — it's the Shopify id, stable across syncs.
 */
function toCustomer(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return {
    sourceId: String(row.id),
    customerCode: row.last_order_name || `SH-${row.id}`,
    name: name || row.email || `Customer ${row.id}`,
    // Same fallback as HAS_PHONE: the account's number if there is one, else
    // the number from their most recent order.
    phone: row.phone_norm || row.phone || row.order_phone || '',
    email: row.email || '',
    city: row.city || '',
    signupDate: row.created_at ? new Date(row.created_at).toISOString() : null,
    ordersCount: Number(row.orders_count || 0),
    totalSpent: row.total_spent == null ? null : Number(row.total_spent),
    lastOrderDate: row.last_order_date ? new Date(row.last_order_date).toISOString() : null,
    lastOrderNumber: row.last_order_name || '',
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

// A calling list is useless without a number, so `withPhone` is the default.
const CUSTOMER_SELECT = `
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.phone_norm, c.city,
         c.created_at, c.orders_count, c.total_spent, c.last_order_name,
         o.last_order_date, op.phone as order_phone
  from customers c
  left join lateral (
    select max(created_at) as last_order_date
    from orders where customer_id = c.id and cancelled_at is null
  ) o on true
  left join lateral (
    select nullif(p.phone,'') as phone
    from orders p
    where p.customer_id = c.id and nullif(p.phone,'') is not null
    order by p.created_at desc
    limit 1
  ) op on true
`

/**
 * Whether we have a number to ring. Shopify only fills `customers.phone` when
 * the shopper saved it to their account — for most guest checkouts the number
 * only ever lands on the order, so a customer-row-only test hides two thirds
 * of the callable list. Written as a self-contained predicate because the
 * count query below has no lateral joins to lean on.
 */
const HAS_PHONE = `(
  coalesce(nullif(c.phone_norm,''), nullif(c.phone,'')) is not null
  or exists (
    select 1 from orders p where p.customer_id = c.id and nullif(p.phone,'') is not null
  )
)`

export async function listCustomers({ limit = 100, offset = 0, search = '', withPhone = true }) {
  const where = []
  const params = []

  if (withPhone) where.push(HAS_PHONE)

  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    const i = params.length
    where.push(`(
      lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) like $${i}
      or lower(coalesce(c.email,'')) like $${i}
      or coalesce(c.phone_norm, c.phone, '') like $${i}
    )`)
  }

  const clause = where.length ? `where ${where.join(' and ')}` : ''
  params.push(Math.min(Number(limit) || 100, 500), Number(offset) || 0)

  const rows = await query(
    `${CUSTOMER_SELECT} ${clause}
     order by o.last_order_date desc nulls last, c.created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params
  )

  const [{ count }] = await query(
    `select count(*)::int as count from customers c ${clause}`,
    params.slice(0, params.length - 2)
  )

  return { customers: rows.map(toCustomer), total: count }
}

/** Headline numbers for the dashboard, computed in the database. */
export async function stats() {
  const [row] = await query(`
    select
      (select count(*)::int from customers) as customers,
      (select count(*)::int from customers c where ${HAS_PHONE}) as customers_with_phone,
      (select count(*)::int from customers where orders_count > 0) as customers_with_orders,
      (select count(*)::int from orders where cancelled_at is null) as orders,
      (select coalesce(sum(total_price), 0) from orders where cancelled_at is null) as revenue,
      (select max(created_at) from orders) as latest_order_at,
      (select count(*)::int from orders
        where cancelled_at is null and created_at >= now() - interval '30 days') as orders_30d
  `)

  return {
    customers: row.customers,
    customersWithPhone: row.customers_with_phone,
    customersWithOrders: row.customers_with_orders,
    orders: row.orders,
    revenue: Number(row.revenue),
    orders30d: row.orders_30d,
    // The frontend shows this prominently: a restored snapshot looks identical
    // to live data unless you say when it was last filled.
    latestOrderAt: row.latest_order_at ? new Date(row.latest_order_at).toISOString() : null,
  }
}

/** Recent orders for one customer, newest first. */
export async function customerOrders(sourceId, limit = 20) {
  const rows = await query(
    `select id, name, order_number, created_at, total_price, financial_status, fulfillment_status
     from orders where customer_id = $1 order by created_at desc limit $2`,
    [sourceId, Math.min(Number(limit) || 20, 100)]
  )
  return rows.map((r) => ({
    sourceId: String(r.id),
    orderNumber: r.name || String(r.order_number || ''),
    orderDate: r.created_at ? new Date(r.created_at).toISOString() : null,
    total: r.total_price == null ? null : Number(r.total_price),
    financialStatus: r.financial_status || '',
    deliveryStatus: r.fulfillment_status || 'pending',
  }))
}

/* ------------------------------------------------------------------ */
/* Segments and the calling queue                                      */
/* ------------------------------------------------------------------ */

/**
 * How hard each segment argues for a call, on the business's own reading of
 * its cohorts (`segment_definitions.campaign` says "Call on priority" for VIP
 * cooling and "always-on" for repeat actives).
 *
 * The four the calling team is pointed at first — repeat actives, both cooling
 * cohorts, and first-timers who ordered once and never came back — sit at the
 * top. Anything not listed still gets called, just lower down.
 */
const SEGMENT_WEIGHT = {
  'VIP · Cooling': 1.0,
  'Repeat · Active': 0.9,
  'Repeat · Cooling': 0.85,
  'VIP · Lapsing': 0.8,
  'First-Time · Nurture': 0.7, // first order done, second never placed
  'Recover · Failed Order': 0.6,
  'Repeat · Lapsing': 0.5,
  'First-Time · Just Ordered': 0.4,
  'First-Time · Lapsed': 0.3,
}

// Someone with one order has no cadence of their own yet. TrueHunt's own
// cohort rules treat 15–45 days as the reorder window for a first-timer, so a
// month is the working assumption until they give us a second data point.
const DEFAULT_GAP_DAYS = 30

/**
 * The queue, scored.
 *
 * The question this answers is "who do I ring first to get an order today?",
 * and no single column answers it. A customer who orders every three weeks and
 * is on day 22 is a better call than one who spent more but only ever ordered
 * once, and both beat someone who ordered yesterday. So the ranking is an index
 * over five things:
 *
 *   due       (40) — where they are against *their own* reorder rhythm, not a
 *                    fixed number of days. Peaks the day they're due, and fades
 *                    once they're so far past it that they've likely moved on.
 *   value     (20) — their biggest order, against the ₹3,000 VIP line.
 *   habit     (15) — how many times they've actually repeated. Two orders is a
 *                    coincidence; four is a habit, and habits are what a call
 *                    can restart.
 *   frequency (15) — order count against the 5+ VIP line.
 *   segment   (10) — the cohort's own priority, above.
 *
 * Every component comes back with the row, so the caller sees why someone is
 * near the top instead of trusting a number.
 */
const QUEUE_SQL = `
with ord_phone as (
  -- One pass over orders for the fallback number, rather than a lateral per
  -- customer: the lateral form of this took nine seconds.
  select distinct on (customer_id) customer_id, phone
  from orders where nullif(phone,'') is not null
  order by customer_id, created_at desc
),
gaps as (
  select customer_id,
         extract(epoch from (created_at - lag(created_at) over (
           partition by customer_id order by created_at))) / 86400 as gap_days
  from orders where cancelled_at is null
),
cadence as (
  select customer_id,
         percentile_cont(0.5) within group (order by gap_days) as median_gap,
         count(*)::int as repeat_gaps
  from gaps where gap_days is not null
  group by 1
),
cust as (
  select c.id, c.first_name, c.last_name, c.email, c.city, c.created_at,
         c.last_order_name,
         coalesce(c.orders_count, 0) as orders_count,
         coalesce(c.total_spent, 0) as total_spent,
         coalesce(nullif(c.phone_norm,''), nullif(c.phone,''), p.phone, '') as phone,
         right(regexp_replace(
           coalesce(nullif(c.phone_norm,''), nullif(c.phone,''), p.phone, ''),
           '[^0-9]', '', 'g'), 10) as digits,
         cad.median_gap,
         coalesce(cad.repeat_gaps, 0) as repeat_gaps
  from customers c
  left join ord_phone p on p.customer_id = c.id
  left join cadence cad on cad.customer_id = c.id
),
seg as (
  -- A number can appear more than once in the cohort table; the most recent
  -- ordering identity is the one that describes them today.
  select distinct on (right(regexp_replace(coalesce(phone_norm,''), '[^0-9]', '', 'g'), 10))
         right(regexp_replace(coalesce(phone_norm,''), '[^0-9]', '', 'g'), 10) as digits,
         sr_no, segment, orders, max_order, recency_days, first_order_at, last_order_at
  from customer_segments
  order by right(regexp_replace(coalesce(phone_norm,''), '[^0-9]', '', 'g'), 10),
           last_order_at desc nulls last
),
joined as (
  select cust.*, seg.sr_no, seg.segment, seg.orders as seg_orders, seg.max_order,
         seg.recency_days, seg.first_order_at, seg.last_order_at,
         -- Their own rhythm, kept inside believable bounds: a seven-day median
         -- from two rushed orders isn't a weekly habit, and a year isn't a
         -- cadence at all.
         least(greatest(coalesce(cust.median_gap, $1), 7), 120) as expected_gap
  from cust join seg using (digits)
  where cust.digits <> ''
),
scored as (
  select *,
    (recency_days::numeric / nullif(expected_gap, 0)) as progress,
    round(expected_gap - recency_days) as due_in_days,
    (last_order_at + (expected_gap || ' days')::interval) as due_at
  from joined
),
ranked as (
  select *,
    case
      when progress is null then 0.3
      -- Climbing towards the reorder date, then falling away once they are so
      -- overdue that a call is a win-back rather than a nudge.
      when progress < 1 then greatest(progress, 0)
      else greatest(0, 1 - (progress - 1) / 1.5)
    end as due_score,
    least(1, coalesce(max_order, 0) / 3000.0) as value_score,
    least(1, repeat_gaps / 3.0) as habit_score,
    least(1, coalesce(seg_orders, 0) / 5.0) as frequency_score,
    coalesce($2::jsonb ->> segment, '0.4')::numeric as segment_score
  from scored
)
select *,
  round(40 * due_score + 20 * value_score + 15 * habit_score
        + 15 * frequency_score + 10 * segment_score) as priority
from ranked
`

const SORTS = {
  priority: 'priority desc nulls last',
  due: 'due_in_days asc nulls last',
  value: 'max_order desc nulls last',
  orders: 'seg_orders desc nulls last',
  recent: 'recency_days asc nulls last',
  lapsed: 'recency_days desc nulls last',
}

function toQueueRow(row) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
  return {
    sourceId: String(row.id),
    customerCode: row.last_order_name || `SH-${row.id}`,
    name: name || row.email || `Customer ${row.id}`,
    phone: row.phone || '',
    email: row.email || '',
    city: row.city || '',
    signupDate: row.created_at ? new Date(row.created_at).toISOString() : null,

    segment: row.segment,
    segmentNo: row.sr_no,

    ordersCount: Number(row.seg_orders || row.orders_count || 0),
    totalSpent: row.total_spent == null ? null : Number(row.total_spent),
    maxOrder: row.max_order == null ? null : Number(row.max_order),
    recencyDays: row.recency_days == null ? null : Number(row.recency_days),
    firstOrderDate: row.first_order_at ? new Date(row.first_order_at).toISOString() : null,
    lastOrderDate: row.last_order_at ? new Date(row.last_order_at).toISOString() : null,

    // What the ranking is made of, so a caller can see the reasoning.
    expectedGapDays: row.expected_gap == null ? null : Math.round(Number(row.expected_gap)),
    dueInDays: row.due_in_days == null ? null : Number(row.due_in_days),
    dueAt: row.due_at ? new Date(row.due_at).toISOString() : null,
    priority: Number(row.priority || 0),
    scores: {
      due: Number(row.due_score || 0),
      value: Number(row.value_score || 0),
      habit: Number(row.habit_score || 0),
      frequency: Number(row.frequency_score || 0),
      segment: Number(row.segment_score || 0),
    },
  }
}

/** The cohort list, with how many people are in each one right now. */
export async function segments() {
  const rows = await query(`
    select d.sr_no, d.segment, d.no_of_orders, d.max_order, d.ordered, d.not_ordered, d.campaign,
           coalesce(c.people, 0)::int as people
    from segment_definitions d
    left join (select sr_no, count(*)::int as people from customer_segments group by 1) c
      on c.sr_no = d.sr_no
    order by d.sr_no
  `)

  return rows.map((r) => ({
    no: r.sr_no,
    name: r.segment,
    orders: r.no_of_orders,
    maxOrder: r.max_order,
    ordered: r.ordered,
    notOrdered: r.not_ordered,
    campaign: r.campaign,
    people: r.people,
    weight: SEGMENT_WEIGHT[r.segment] ?? 0.4,
  }))
}

/** The scored calling queue, optionally narrowed to some cohorts. */
export async function callQueue({
  segments: only = [],
  sort = 'priority',
  search = '',
  limit = 100,
  offset = 0,
} = {}) {
  const params = [DEFAULT_GAP_DAYS, JSON.stringify(SEGMENT_WEIGHT)]
  const where = [`phone <> ''`]

  if (only.length) {
    params.push(only.map(Number).filter(Boolean))
    where.push(`sr_no = any($${params.length})`)
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`)
    const i = params.length
    where.push(`(
      lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) like $${i}
      or lower(coalesce(email,'')) like $${i}
      or phone like $${i}
    )`)
  }

  const clause = `where ${where.join(' and ')}`
  const order = SORTS[sort] || SORTS.priority

  params.push(Math.min(Number(limit) || 100, 500), Number(offset) || 0)

  const rows = await query(
    `with q as (${QUEUE_SQL}) select * from q ${clause}
     order by ${order}, priority desc limit $${params.length - 1} offset $${params.length}`,
    params
  )

  const [{ count }] = await query(
    `with q as (${QUEUE_SQL}) select count(*)::int as count from q ${clause}`,
    params.slice(0, params.length - 2)
  )

  return { customers: rows.map(toQueueRow), total: count, sort }
}

/**
 * Every cohort this number has been recorded in, newest first.
 *
 * Two tables hold snapshots — `customer_segment_history` and `segment_history`
 * — written by different jobs, so both are read and merged. Consecutive
 * snapshots in the same cohort collapse into one "moved here on…" row, which
 * is the only part anyone actually wants to see.
 */
export async function segmentHistory(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10)
  if (!digits) return []

  const rows = await query(
    `select as_of, segment, sr_no, orders, recency_days from (
       select snapshot_date as as_of, segment, sr_no, orders, recency_days, identity_key
       from customer_segment_history
       union all
       select as_of, segment, sr_no, orders, recency_days, identity_key
       from segment_history
     ) h
     where right(regexp_replace(coalesce(identity_key,''), '[^0-9]', '', 'g'), 10) = $1
     order by as_of desc`,
    [digits]
  )

  // Collapse runs: five snapshots in "Repeat · Active" is one stretch, not five
  // events. What matters is the day it changed.
  const trail = []
  rows.forEach((r) => {
    const last = trail[trail.length - 1]
    if (last && last.segment === r.segment) {
      last.since = new Date(r.as_of).toISOString()
      return
    }
    trail.push({
      segment: r.segment,
      segmentNo: r.sr_no,
      since: new Date(r.as_of).toISOString(),
      until: last ? last.since : null,
      orders: r.orders == null ? null : Number(r.orders),
      recencyDays: r.recency_days == null ? null : Number(r.recency_days),
    })
  })

  return trail
}

/** The cohort a single number sits in today. */
export async function customerSegment(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10)
  if (!digits) return null

  const rows = await query(
    `select sr_no, segment, orders, max_order, recency_days, first_order_at, last_order_at
     from customer_segments
     where right(regexp_replace(coalesce(phone_norm,''), '[^0-9]', '', 'g'), 10) = $1
     order by last_order_at desc nulls last limit 1`,
    [digits]
  )
  if (!rows.length) return null

  const r = rows[0]
  return {
    segmentNo: r.sr_no,
    segment: r.segment,
    orders: Number(r.orders || 0),
    maxOrder: r.max_order == null ? null : Number(r.max_order),
    recencyDays: r.recency_days == null ? null : Number(r.recency_days),
    firstOrderDate: r.first_order_at ? new Date(r.first_order_at).toISOString() : null,
    lastOrderDate: r.last_order_at ? new Date(r.last_order_at).toISOString() : null,
  }
}
