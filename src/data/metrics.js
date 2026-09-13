// Derived numbers and the call-queue segmentation. Kept out of components so the
// definitions live in exactly one place.

const DAY = 86400000

export function daysBetween(a, b) {
  if (!a || !b) return null
  const start = new Date(a).getTime()
  const end = new Date(b).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.floor((end - start) / DAY)
}

export function firstOrder(orders) {
  if (!orders.length) return null
  return [...orders].sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate))[0]
}

export function latestOrder(orders) {
  if (!orders.length) return null
  return [...orders].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))[0]
}

/**
 * The date the customer first ordered — a customer-level fact, not a duration.
 * Returned as an ISO string so callers format it however they need.
 */
export function firstOrderDate(customerOrders) {
  return firstOrder(customerOrders)?.orderDate ?? null
}

/** Signup → first order. How long they took to convert. */
export function daysToFirstOrder(customer, customerOrders) {
  const first = firstOrder(customerOrders)
  if (!first || !customer?.signupDate) return null
  const d = daysBetween(customer.signupDate, first.orderDate)
  return d === null ? null : Math.max(0, d)
}

/** First order → today. How long they've been a customer. */
export function daysSinceFirstOrder(customerOrders) {
  const first = firstOrder(customerOrders)
  if (!first) return null
  const d = daysBetween(first.orderDate, new Date().toISOString())
  return d === null ? null : Math.max(0, d)
}

export function connectedCalls(calls) {
  return calls.filter((c) => c.status === 'completed' && c.connectedAt)
}

/**
 * The three call-queue tabs.
 *
 *  firstTime — never actually spoken to. The priority queue.
 *  followUp  — has an open callback ticket.
 *  repeat    — spoken to before, nothing scheduled.
 */
export function segmentCustomers({ customers, calls, tickets }) {
  const callsByCustomer = calls.reduce((acc, call) => {
    ;(acc[call.customerId] ||= []).push(call)
    return acc
  }, {})

  const openTicketByCustomer = tickets.reduce((acc, t) => {
    if (t.status === 'pending') acc[t.customerId] = t
    return acc
  }, {})

  const buckets = { firstTime: [], repeat: [], followUp: [] }

  customers.forEach((customer) => {
    // They asked not to be called. Keeping them in a queue would mean someone
    // eventually rings them anyway.
    if (customer.doNotCall) return

    const own = callsByCustomer[customer.id] || []
    const spoken = connectedCalls(own).length > 0
    const ticket = openTicketByCustomer[customer.id]

    const entry = {
      customer,
      calls: own,
      ticket,
      attempted: own.filter((c) => c.status !== 'didntCall').length,
      lastCall: [...own].sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt))[0] || null,
    }

    if (ticket) buckets.followUp.push(entry)
    else if (spoken) buckets.repeat.push(entry)
    else buckets.firstTime.push(entry)
  })

  buckets.followUp.sort((a, b) => new Date(a.ticket.scheduledFor) - new Date(b.ticket.scheduledFor))
  // Oldest customers first — the ones who've been waiting longest since signup.
  buckets.firstTime.sort((a, b) => new Date(a.customer.signupDate) - new Date(b.customer.signupDate))
  buckets.repeat.sort(
    (a, b) => new Date(a.customer.lastCalledAt || 0) - new Date(b.customer.lastCalledAt || 0)
  )

  return buckets
}
