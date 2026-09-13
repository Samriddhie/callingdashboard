import React, { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { CallOutcomeBadge, EmptyState } from '../components/Badges.jsx'
import { useData } from '../data/DataContext.jsx'
import { ALL_DISPOSITIONS } from '../data/schema.js'
import { fmtDateTime, fmtDuration, initials } from '../data/format.js'

// Every call, with who made it — the attribution record.
export default function HistoryPage({ onOpenCustomer }) {
  const { customers, calls, users, deleteCall } = useData()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [agent, setAgent] = useState('all')
  // Deleting is permanent and there is no undo, so the trash icon only arms the
  // row — the second click is the one that removes it.
  const [confirmId, setConfirmId] = useState(null)

  const rows = useMemo(() => {
    const customerById = Object.fromEntries(customers.map((c) => [c.id, c]))
    const q = query.trim().toLowerCase()

    return calls
      .map((call) => ({ call, customer: customerById[call.customerId] }))
      .filter(({ call, customer }) => {
        if (agent !== 'all' && call.initiatedBy !== agent) return false
        if (filter === 'connected' && !call.connectedAt) return false
        if (filter === 'notConnected' && call.status !== 'notConnected') return false
        if (filter === 'didntCall' && call.status !== 'didntCall') return false
        if (
          filter !== 'all' &&
          filter !== 'connected' &&
          filter !== 'notConnected' &&
          filter !== 'didntCall' &&
          call.disposition !== filter
        )
          return false
        if (!q) return true
        return [customer?.name, customer?.customerCode, call.notes, call.initiatedByName].some((f) =>
          (f || '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(b.call.initiatedAt) - new Date(a.call.initiatedAt))
  }, [calls, customers, query, filter, agent])

  return (
    <div>
      <PageHeader
        title="Call history"
        subtitle={`${calls.length} attempts logged · ${rows.length} shown`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search customer, ID, note or caller…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter by outcome"
        >
          <option value="all">All outcomes</option>
          <option value="connected">Connected</option>
          <option value="notConnected">Not connected</option>
          <option value="didntCall">Didn’t call</option>
          <optgroup label="Disposition">
            {ALL_DISPOSITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </optgroup>
        </select>
        <select
          className="input w-auto"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          aria-label="Filter by caller"
        >
          <option value="all">Everyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={calls.length ? 'ti-search-off' : 'ti-history'}
          title={calls.length ? 'No calls match those filters' : 'No calls logged yet'}
          hint={
            calls.length
              ? 'Try clearing the search or picking a different filter.'
              : 'Every call attempt lands here, including ones that never connected.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ call, customer }) => (
            <li key={call.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                    {initials(customer?.name || '?')}
                  </span>
                  <div className="min-w-0">
                    {customer ? (
                      <button
                        type="button"
                        onClick={() => onOpenCustomer(customer.id)}
                        className="text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
                      >
                        {customer.name}
                      </button>
                    ) : (
                      <span className="text-sm font-medium text-gray-400">Deleted customer</span>
                    )}
                    <div className="text-xs text-gray-500">
                      {customer?.customerCode || '—'}
                      {call.phoneNumber && ` · ${call.phoneNumber}`}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CallOutcomeBadge call={call} />
                  <span className="text-xs text-gray-500">{fmtDateTime(call.initiatedAt)}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmId(confirmId === call.id ? null : call.id)}
                    aria-label={`Delete this call from ${fmtDateTime(call.initiatedAt)}`}
                    title="Delete this call"
                    className={`rounded-md p-1 transition ${
                      confirmId === call.id
                        ? 'bg-red-50 text-red-600'
                        : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                    }`}
                  >
                    <i className="ti ti-trash text-base" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-12 text-xs text-gray-600">
                <span>
                  <i className="ti ti-user mr-1 text-gray-400" />
                  {call.initiatedByName || 'Unknown'}
                </span>
                {call.connectedAt && (
                  <span>
                    <i className="ti ti-clock mr-1 text-gray-400" />
                    <span className="font-mono">{fmtDuration(call.durationSec)}</span>
                  </span>
                )}
                {call.completedAt && (
                  <span className="text-gray-400">wrapped {fmtDateTime(call.completedAt)}</span>
                )}
              </div>

              {call.notes && <p className="mt-2 whitespace-pre-wrap pl-12 text-sm text-gray-600">{call.notes}</p>}

              {confirmId === call.id && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs text-red-800">
                    Delete this attempt{call.notes ? ' and its note' : ''}? This can’t be undone.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-sm" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        deleteCall(call.id)
                        setConfirmId(null)
                      }}
                    >
                      <i className="ti ti-trash" />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
