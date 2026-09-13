import React, { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import PriorityQueue from './PriorityQueue.jsx'
import { CallOutcomeBadge, DeliveryBadge, EmptyState } from '../components/Badges.jsx'
import { useData } from '../data/DataContext.jsx'
import { daysSinceFirstOrder, firstOrder, segmentCustomers } from '../data/metrics.js'
import { fmtDate, fmtDateTime, fmtRelative, initials, isOverdue, maskPhone } from '../data/format.js'

const TABS = [
  // Live and scored, and first because it is the answer to "who now?".
  { id: 'priority', label: 'Priority queue', icon: 'ti-flame', hint: 'Live, segment-scored' },
  { id: 'firstTime', label: 'First-time calls', icon: 'ti-user-plus', hint: 'Never spoken to yet' },
  { id: 'repeat', label: 'Repeat calls', icon: 'ti-repeat', hint: 'Spoken to before' },
  { id: 'followUp', label: 'Follow-ups', icon: 'ti-clock', hint: 'Callback scheduled' },
]

export default function CallQueuePage({ onOpenCustomer, onCall }) {
  const { customers, calls, tickets, orders } = useData()
  const [tab, setTab] = useState('priority')
  const [query, setQuery] = useState('')

  const buckets = useMemo(
    () => segmentCustomers({ customers, calls, tickets }),
    [customers, calls, tickets]
  )

  const ordersByCustomer = useMemo(
    () =>
      orders.reduce((acc, o) => {
        ;(acc[o.customerId] ||= []).push(o)
        return acc
      }, {}),
    [orders]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = buckets[tab] || []
    if (!q) return list
    return list.filter((r) =>
      [r.customer.name, r.customer.customerCode, r.customer.phone].some((f) =>
        (f || '').toLowerCase().includes(q)
      )
    )
  }, [buckets, tab, query])

  return (
    <div>
      <PageHeader title="Call queue" subtitle="Who to call first, scored on segment, reorder timing, value and habit." />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.id === 'priority' ? null : buckets[t.id].length
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`btn ${active ? 'border-blue-600 bg-blue-50 text-blue-700' : ''}`}
            >
              <i className={`ti ${t.icon}`} />
              {t.label}
              {count != null && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${
                    active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'priority' && <PriorityQueue onOpenCustomer={onOpenCustomer} onCall={onCall} />}

      {tab !== 'priority' && (
      <div className="relative mb-4">
        <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search this queue by name, customer ID or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      )}

      {tab !== 'priority' && (rows.length === 0 ? (
        <EmptyState
          icon="ti-phone-check"
          title={query ? 'Nothing matches that search' : `Nothing in ${TABS.find((t) => t.id === tab).label.toLowerCase()}`}
          hint={
            query
              ? 'Try a different name or ID.'
              : tab === 'firstTime'
              ? 'Every customer here has been spoken to at least once.'
              : tab === 'followUp'
              ? 'Callbacks appear here when a call is dispositioned as “Callback”.'
              : 'Customers move here once you have connected with them.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <QueueRow
              key={row.customer.id}
              row={row}
              tab={tab}
              customerOrders={ordersByCustomer[row.customer.id] || []}
              onOpen={() => onOpenCustomer(row.customer.id)}
              onCall={() => onCall(row.customer.id)}
            />
          ))}
        </ul>
      ))}
    </div>
  )
}

function Fact({ label, value, tone = 'text-gray-900' }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-sm ${tone}`}>{value}</div>
    </div>
  )
}

function QueueRow({ row, tab, customerOrders, onOpen, onCall }) {
  const { customer, ticket, attempted, lastCall } = row
  const first = firstOrder(customerOrders)
  const sinceFirst = daysSinceFirstOrder(customerOrders)
  const overdue = ticket && isOverdue(ticket.scheduledFor)

  return (
    <li className={`card p-4 ${overdue ? 'border-red-200 bg-red-50/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              overdue ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {initials(customer.name)}
          </span>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpen}
              className="text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
            >
              {customer.name}
            </button>
            <div className="text-xs text-gray-500">
              {customer.customerCode} · {maskPhone(customer.phone)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Fact
                label="First order"
                value={first ? fmtDate(first.orderDate) : '—'}
                tone={first ? 'text-gray-900' : 'text-gray-400'}
              />
              <Fact
                label="Days since 1st order"
                value={sinceFirst === null ? 'No orders' : `${sinceFirst}d`}
              />
              <Fact
                label="Delivery"
                value={
                  first ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <DeliveryBadge status={first.deliveryStatus} />
                      {first.deliveryDate && (
                        <span className="text-xs text-gray-500">{fmtDate(first.deliveryDate)}</span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <Fact
                label="Called before?"
                value={
                  attempted === 0 ? (
                    <span className="text-gray-500">Never</span>
                  ) : (
                    `${attempted} attempt${attempted === 1 ? '' : 's'}`
                  )
                }
              />
            </div>

            {lastCall && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-400">Last call</span>
                <CallOutcomeBadge call={lastCall} />
                <span className="text-xs text-gray-500">{fmtDateTime(lastCall.initiatedAt)}</span>
                <span className="text-xs text-gray-400">by {lastCall.initiatedByName || '—'}</span>
              </div>
            )}

            {tab === 'followUp' && ticket && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`badge ${
                    overdue ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <i className={`ti ${overdue ? 'ti-alert-triangle' : 'ti-calendar'} text-sm`} />
                  {overdue ? 'Overdue' : 'Due'} {fmtDateTime(ticket.scheduledFor)}
                </span>
                <span className="badge bg-gray-100 text-gray-600">
                  {fmtRelative(ticket.scheduledFor)}
                </span>
                <span className="badge bg-gray-100 text-gray-600">
                  <i className="ti ti-repeat text-sm" />
                  Attempt {ticket.attemptCount}
                </span>
              </div>
            )}

            {lastCall?.notes && (
              <p className="mt-2 line-clamp-2 text-sm text-gray-600">“{lastCall.notes}”</p>
            )}
          </div>
        </div>

        <button type="button" className="btn btn-primary shrink-0" onClick={onCall}>
          <i className="ti ti-phone-call" />
          Call
        </button>
      </div>
    </li>
  )
}
