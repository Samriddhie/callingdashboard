import React, { useEffect, useState } from 'react'
import { fetchEngagement } from '../data/api.js'
import { fmtDate, fmtDateTime } from '../data/format.js'
import { INFO_FIELDS } from '../data/schema.js'
import { useData } from '../data/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const rupees = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

/**
 * What GoKwik knows about this customer: the WhatsApp thread, how campaign
 * messages landed, and any cart they walked away from.
 *
 * Read-only, and fetched rather than synced — unlike customer records, this is
 * conversation history that would go stale the moment it was copied.
 */
export default function EngagementPanel({ customer }) {
  const phone = customer.phone
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })

  useEffect(() => {
    if (!phone) {
      setState({ status: 'nophone', data: null, error: '' })
      return undefined
    }

    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: '' })

    fetchEngagement(phone, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', data, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setState({ status: 'error', data: null, error: err.message })
      })

    return () => controller.abort()
  }, [phone])

  const { status, data, error } = state

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">GoKwik</h2>
        {status === 'loading' && (
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <i className="ti ti-loader-2 animate-spin" />
            Loading…
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        WhatsApp, campaigns and abandoned carts, read live from GoKwik.
      </p>

      {status === 'nophone' && (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
          No phone number on file to match against
        </p>
      )}

      {status === 'error' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {status === 'ready' && !data.matched && (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
          Nothing on this number in GoKwik
        </p>
      )}

      {status === 'ready' && data.matched && (
        <div className="space-y-4">
          {data.carts.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Abandoned carts ({data.carts.length})
              </h3>
              <ul className="space-y-1.5">
                {data.carts.map((cart) => (
                  <li
                    key={cart.id}
                    className={`rounded-lg border p-2.5 ${
                      cart.recovered
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {rupees(cart.value)}
                      </span>
                      <span
                        className={`badge ${
                          cart.recovered
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cart.recovered ? 'Recovered' : 'Not recovered'}
                      </span>
                    </div>
                    {cart.items && <p className="mt-0.5 text-xs text-gray-700">{cart.items}</p>}
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Left {fmtDate(cart.abandonedAt)}
                      {cart.recovered && cart.recoveredAt
                        ? ` · recovered ${fmtDate(cart.recoveredAt)}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.campaigns?.sent > 0 && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Campaign messages
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <span className="badge bg-gray-100 text-gray-600">{data.campaigns.sent} sent</span>
                <span className="badge bg-blue-50 text-blue-700">{data.campaigns.seen} seen</span>
                {data.campaigns.clicked > 0 && (
                  <span className="badge bg-green-50 text-green-700">
                    {data.campaigns.clicked} clicked
                  </span>
                )}
                {data.campaigns.failed > 0 && (
                  <span className="badge bg-red-50 text-red-700">
                    {data.campaigns.failed} failed
                  </span>
                )}
              </div>
              {data.campaigns.lastSentAt && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Last sent {fmtDateTime(data.campaigns.lastSentAt)}
                </p>
              )}
            </div>
          )}

          {data.messages.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                WhatsApp ({data.messages.length})
              </h3>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {data.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-2 ${
                      m.direction === 'incoming'
                        ? 'border-gray-200 bg-white'
                        : 'border-blue-100 bg-blue-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                      <span>
                        <i
                          className={`ti mr-1 ${
                            m.direction === 'incoming' ? 'ti-arrow-down-left' : 'ti-arrow-up-right'
                          }`}
                        />
                        {m.direction === 'incoming' ? 'They said' : 'We sent'}
                      </span>
                      <span>{fmtDateTime(m.at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-800">
                      {m.text || <span className="text-gray-400">[{m.contentType}]</span>}
                    </p>

                    {/* A customer who answers a campaign message has told us
                        something as real as anything said on a call. Filing it
                        copies it into a structured column carrying this
                        message's id and the time they actually sent it. */}
                    {m.direction === 'incoming' && m.text && (
                      <FileMessage customer={customer} message={m} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Filing a WhatsApp reply into the record                             */
/* ------------------------------------------------------------------ */

function FileMessage({ customer, message }) {
  const { recordInfo, infoEntries } = useData()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(INFO_FIELDS[0].key)

  // Filed once already? Say so rather than inviting a duplicate — the same
  // message landing twice in the history is noise, not a second data point.
  const filed = infoEntries.find(
    (e) => e.interactionId === message.id && e.customerId === customer.id
  )

  if (filed) {
    return (
      <p className="mt-1.5 text-[11px] font-medium text-green-700">
        <i className="ti ti-check" /> Filed under {filed.label}
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline"
        onClick={() => setOpen(true)}
      >
        <i className="ti ti-archive" /> File this into the record
      </button>
    )
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <select
        className="input h-7 w-auto py-0 text-xs"
        value={field}
        onChange={(e) => setField(e.target.value)}
      >
        {INFO_FIELDS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={() => {
          const meta = INFO_FIELDS.find((f) => f.key === field)
          recordInfo({
            customerId: customer.id,
            field,
            label: meta.label,
            value: message.text,
            source: 'gokwik',
            interactionId: message.id,
            // When they sent it, not when an agent got round to filing it.
            occurredAt: message.at,
            createdBy: user?.id || null,
            createdByName: user?.name || '',
          })
          setOpen(false)
        }}
      >
        Save
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  )
}
