import React, { useEffect, useMemo, useState } from 'react'
import { useData } from '../data/DataContext.jsx'
import { CUSTOMER_STATUSES } from '../data/schema.js'
import { EmptyState } from '../components/Badges.jsx'
import CatsPanel from '../components/CatsPanel.jsx'
import { latestOrder } from '../data/metrics.js'
import CallSummary from '../components/CallSummary.jsx'
import CallHistoryModal from '../components/CallHistoryModal.jsx'
import ShopifySummary from '../components/ShopifySummary.jsx'
import EngagementPanel from '../components/EngagementPanel.jsx'
import { PreCallBrief, SegmentInline } from '../components/CustomerContext.jsx'
import { fetchConfig, shopifyCustomerUrl } from '../data/api.js'
import {
  fmtDate,
  fmtDateTime,
  fmtRelative,
  initials,
  maskPhone,
  isOverdue,
} from '../data/format.js'

export default function CustomerDetailPage({ customerId, onBack, backLabel, onCall }) {
  const { customers, cats, orders, calls, tickets, noteEntries, infoEntries } = useData()
  const customer = customers.find((c) => c.id === customerId)

  const [showHistory, setShowHistory] = useState(false)
  const [store, setStore] = useState(null)

  useEffect(() => {
    fetchConfig().then((c) => setStore(c.shopifyStore || null))
  }, [])

  const ownCats = useMemo(() => cats.filter((c) => c.customerId === customerId), [cats, customerId])
  const ownOrders = useMemo(
    () => orders.filter((o) => o.customerId === customerId),
    [orders, customerId]
  )
  const ownCalls = useMemo(
    () =>
      calls
        .filter((c) => c.customerId === customerId)
        .sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt)),
    [calls, customerId]
  )
  const ownInfo = useMemo(
    () =>
      infoEntries
        .filter((e) => e.customerId === customerId)
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
    [infoEntries, customerId]
  )

  const ownNotes = useMemo(
    () =>
      noteEntries
        .filter((n) => n.customerId === customerId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [noteEntries, customerId]
  )

  const openTicket = tickets.find((t) => t.customerId === customerId && t.status === 'pending')

  if (!customer) {
    return (
      <div>
        <button type="button" className="btn btn-sm mb-4" onClick={onBack}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <EmptyState icon="ti-user-off" title="Customer not found" />
      </div>
    )
  }

  // The CRM sync writes this straight onto the customer; fall back to local
  // order rows for anyone who was added by hand or by CSV.
  const lastOrderedOn = customer.lastOrderDate ?? latestOrder(ownOrders)?.orderDate ?? null

  const statusMeta = CUSTOMER_STATUSES.find((s) => s.value === customer.status)

  return (
    <div>
      <button type="button" className="btn btn-sm mb-4" onClick={onBack}>
        <i className="ti ti-arrow-left" /> {backLabel || 'Back'}
      </button>

      <div className="card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
              {initials(customer.name)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-gray-900">{customer.name}</h1>
                {statusMeta && <span className={`badge ${statusMeta.tone}`}>{statusMeta.label}</span>}
              </div>
              <p className="mt-0.5 text-sm text-gray-500">
                {customer.customerCode} · {maskPhone(customer.phone)}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Last called {fmtRelative(customer.lastCalledAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {customer.sourceId && shopifyCustomerUrl(store, customer.sourceId) ? (
              <a
                href={shopifyCustomerUrl(store, customer.sourceId)}
                target="_blank"
                rel="noreferrer"
                className="btn"
                title="Open this customer in Shopify"
              >
                <i className="ti ti-brand-shopify" />
                Shopify
              </a>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => onCall(customer.id)}>
              <i className="ti ti-phone-call" />
              Call
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4">
          {/* The cohort belongs with the other headline facts, not in a card of
              its own — it is the first thing that says what this call is for. */}
          <SegmentInline phone={customer.phone} />
          <Metric
            label="Last order"
            value={lastOrderedOn ? fmtDate(lastOrderedOn) : '—'}
            hint={lastOrderedOn ? 'Most recent order on file' : 'No orders yet'}
          />
          <Metric label="Cats" value={ownCats.length} />
          <Metric
            label="Calls"
            value={ownCalls.filter((c) => c.status !== 'didntCall').length}
            hint={`${ownCalls.filter((c) => c.connectedAt).length} connected`}
          />
        </div>
      </div>

      {openTicket && (
        <div
          className={`card mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm ${
            isOverdue(openTicket.scheduledFor)
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <i className="ti ti-clock text-base" />
          <span className="font-medium">
            {isOverdue(openTicket.scheduledFor) ? 'Overdue callback' : 'Callback scheduled'}
          </span>
          <span>{fmtDateTime(openTicket.scheduledFor)}</span>
          <span className="text-gray-600">· attempt {openTicket.attemptCount}</span>
        </div>
      )}

      {/* The forms a caller fills in while the customer is on the line lead the
          page. Everything on the right is context to glance at, and glancing
          costs less than scrolling to the thing you are typing into. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CatsPanel customer={customer} cats={ownCats} />
        </div>

        <div className="space-y-4">
          {/* Who they are before what we have said to them: the Shopify record
              is the fact the rest of this column is commentary on. */}
          <ShopifySummary customer={customer} />
          <CallSummary
            customer={customer}
            calls={ownCalls}
            notes={ownNotes}
            cats={ownCats}
            ticket={openTicket}
            onOpenHistory={() => setShowHistory(true)}
          />
          <PreCallBrief
            customer={customer}
            cats={ownCats}
            calls={ownCalls}
            notes={ownNotes}
            infoEntries={ownInfo}
          />
          <EngagementPanel customer={customer} />
        </div>
      </div>

      {showHistory && (
        <CallHistoryModal
          customer={customer}
          calls={ownCalls}
          notes={ownNotes}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-[11px] text-gray-500">{hint}</div>}
    </div>
  )
}
