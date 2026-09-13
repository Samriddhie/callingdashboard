import React, { useMemo } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { CallOutcomeBadge, EmptyState } from '../components/Badges.jsx'
import { useData } from '../data/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { daysToFirstOrder, segmentCustomers } from '../data/metrics.js'
import { fmtDateTime, fmtDuration, fmtRelative, initials, isOverdue, isToday } from '../data/format.js'

const CARD_TONES = {
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  green: 'border-green-100 bg-green-50 text-green-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
  purple: 'border-purple-100 bg-purple-50 text-purple-700',
}

function StatCard({ tone, icon, label, value, hint }) {
  return (
    <div className={`rounded-xl border p-4 ${CARD_TONES[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium">
        <i className={`ti ${icon} text-base`} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs opacity-80">{hint}</div>}
    </div>
  )
}

export default function DashboardPage({ onOpenCustomer, onCall, onNavigate }) {
  const { customers, calls, tickets, orders } = useData()
  const { user } = useAuth()

  const customerById = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  )

  const ordersByCustomer = useMemo(
    () =>
      orders.reduce((acc, o) => {
        ;(acc[o.customerId] ||= []).push(o)
        return acc
      }, {}),
    [orders]
  )

  const todaysCalls = useMemo(
    () => calls.filter((c) => isToday(c.initiatedAt) && c.status !== 'didntCall'),
    [calls]
  )
  const myCallsToday = todaysCalls.filter((c) => c.initiatedBy === user?.id).length
  const connectedToday = todaysCalls.filter((c) => c.connectedAt).length

  const buckets = useMemo(
    () => segmentCustomers({ customers, calls, tickets }),
    [customers, calls, tickets]
  )

  const pending = buckets.followUp
  const overdueCount = pending.filter((r) => isOverdue(r.ticket.scheduledFor)).length

  const interestedCount = customers.filter(
    (c) => c.subscriptionInterest && c.subscriptionStatus !== 'cancelled'
  ).length
  const confirmedCount = customers.filter((c) => c.subscriptionStatus === 'confirmed').length

  // Average days to first order across everyone who has actually ordered.
  const avgDaysToFirst = useMemo(() => {
    const values = customers
      .map((c) => daysToFirstOrder(c, ordersByCustomer[c.id] || []))
      .filter((v) => v !== null)
    if (!values.length) return null
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  }, [customers, ordersByCustomer])

  const recentCalls = useMemo(
    () =>
      [...calls]
        .sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt))
        .slice(0, 6),
    [calls]
  )

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle="TrueHunt Cat Foods — outbound calling"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          tone="blue"
          icon="ti-users"
          label="Total customers"
          value={customers.length}
          hint={
            avgDaysToFirst === null
              ? 'No orders yet'
              : `${avgDaysToFirst}d avg to first order`
          }
        />
        <StatCard
          tone="green"
          icon="ti-phone-call"
          label="Calls today"
          value={todaysCalls.length}
          hint={`${connectedToday} connected · ${myCallsToday} by you`}
        />
        <StatCard
          tone="amber"
          icon="ti-clock"
          label="Follow-ups due"
          value={pending.length}
          hint={overdueCount ? `${overdueCount} overdue` : 'None overdue'}
        />
        <StatCard
          tone="purple"
          icon="ti-refresh"
          label="Subscriptions"
          value={interestedCount}
          hint={`${confirmedCount} confirmed`}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QueueTile
          label="First-time calls"
          count={buckets.firstTime.length}
          icon="ti-user-plus"
          onClick={() => onNavigate('queue')}
        />
        <QueueTile
          label="Repeat calls"
          count={buckets.repeat.length}
          icon="ti-repeat"
          onClick={() => onNavigate('queue')}
        />
        <QueueTile
          label="Follow-ups"
          count={buckets.followUp.length}
          icon="ti-clock"
          onClick={() => onNavigate('queue')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming follow-ups</h2>
            <button
              type="button"
              className="text-xs font-medium text-blue-600 hover:underline"
              onClick={() => onNavigate('queue')}
            >
              View all
            </button>
          </div>

          {pending.length === 0 ? (
            <EmptyState
              icon="ti-clock-check"
              title="Nothing scheduled"
              hint="Follow-ups appear when a call is dispositioned as “Callback”."
            />
          ) : (
            <ul className="space-y-2">
              {pending.slice(0, 5).map(({ ticket, customer }) => {
                const overdue = isOverdue(ticket.scheduledFor)
                return (
                  <li
                    key={ticket.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                      overdue ? 'border-red-200 bg-red-50/50' : 'border-gray-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenCustomer(customer.id)}
                        className="truncate text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
                      >
                        {customer.name}
                      </button>
                      <div className={`truncate text-xs ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                        {overdue && <i className="ti ti-alert-triangle mr-1" />}
                        {fmtDateTime(ticket.scheduledFor)} · attempt {ticket.attemptCount}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm shrink-0"
                      onClick={() => onCall(customer.id)}
                    >
                      <i className="ti ti-phone-call" />
                      Call
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recently called</h2>
            <button
              type="button"
              className="text-xs font-medium text-blue-600 hover:underline"
              onClick={() => onNavigate('history')}
            >
              View all
            </button>
          </div>

          {recentCalls.length === 0 ? (
            <EmptyState
              icon="ti-history"
              title="No calls yet"
              hint="Open the call queue and dial your first customer."
            />
          ) : (
            <ul className="space-y-2">
              {recentCalls.map((call) => {
                const customer = customerById[call.customerId]
                return (
                  <li
                    key={call.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                        {initials(customer?.name || '?')}
                      </span>
                      <div className="min-w-0">
                        {customer ? (
                          <button
                            type="button"
                            onClick={() => onOpenCustomer(customer.id)}
                            className="truncate text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
                          >
                            {customer.name}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">Deleted customer</span>
                        )}
                        <div className="truncate text-xs text-gray-500">
                          {call.initiatedByName || '—'} · {fmtRelative(call.initiatedAt)}
                          {call.connectedAt && ` · ${fmtDuration(call.durationSec)}`}
                        </div>
                      </div>
                    </div>
                    <CallOutcomeBadge call={call} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function QueueTile({ label, count, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex items-center justify-between p-4 text-left transition hover:border-blue-300 hover:shadow-sm"
    >
      <span className="flex items-center gap-2 text-sm text-gray-600">
        <i className={`ti ${icon} text-base text-gray-400`} />
        {label}
      </span>
      <span className="text-lg font-semibold text-gray-900">{count}</span>
    </button>
  )
}
