import React, { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/Badges.jsx'
import { fetchConfig, fetchQueue, fetchSegments, shopifyCustomerUrl } from '../data/api.js'
import { useData } from '../data/DataContext.jsx'
import { fmtDate, initials, maskPhone } from '../data/format.js'

/**
 * The calling queue, built from the live cohort tables rather than from
 * whatever happens to be synced locally.
 *
 * The point of this screen is that nobody has to decide who to ring. The
 * backend scores every customer on where they are in their own reorder rhythm,
 * what they are worth, how habitual they are and which cohort they sit in, and
 * hands back the order to work down. The filters narrow the pool; they never
 * change the fact that the top of the list is the next call.
 */

const SORTS = [
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Most overdue to reorder' },
  { value: 'value', label: 'Highest order value' },
  { value: 'orders', label: 'Most orders' },
  { value: 'recent', label: 'Ordered most recently' },
  { value: 'lapsed', label: 'Quiet the longest' },
]

// Where the calling effort goes first, per the brief: repeat actives, both
// cooling cohorts, and the first-timers who ordered once and stopped.
const FOCUS = [4, 5, 6, 2]

const rupees = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

function dueLabel(days) {
  if (days == null) return { text: 'No rhythm yet', tone: 'text-gray-500' }
  if (days < -30) return { text: `${Math.abs(days)}d overdue`, tone: 'text-gray-500' }
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'text-red-600 font-semibold' }
  if (days === 0) return { text: 'Due today', tone: 'text-red-600 font-semibold' }
  if (days <= 7) return { text: `Due in ${days}d`, tone: 'text-amber-600 font-semibold' }
  return { text: `Due in ${days}d`, tone: 'text-gray-500' }
}

export default function PriorityQueue({ onOpenCustomer, onCall }) {
  const { addCustomer, customers } = useData()

  const [segments, setSegments] = useState([])
  const [picked, setPicked] = useState(FOCUS)
  const [sort, setSort] = useState('priority')
  const [search, setSearch] = useState('')
  const [state, setState] = useState({ status: 'loading', rows: [], total: 0, error: '' })
  const [store, setStore] = useState(null)

  useEffect(() => {
    fetchSegments().then(setSegments).catch(() => setSegments([]))
    fetchConfig().then((c) => setStore(c.shopifyStore || null))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // Typing shouldn't fire a query per keystroke against a live database.
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, status: 'loading', error: '' }))
      fetchQueue({ segments: picked, sort, search, limit: 100 }, { signal: controller.signal })
        .then((d) => setState({ status: 'ready', rows: d.customers, total: d.total, error: '' }))
        .catch((err) => {
          if (err.name === 'AbortError') return
          setState({ status: 'error', rows: [], total: 0, error: err.message })
        })
    }, search ? 300 : 0)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [picked, sort, search])

  /**
   * Calling needs a local record to hang the call, its note and the history
   * off. Queue rows are live CRM data, so one is created on the way into the
   * call — matched on the Shopify id first, then on the last ten digits of the
   * number, so a customer who was already synced or typed in by hand doesn't
   * get a duplicate.
   */
  const ensureLocal = (row) => {
    const digits = (row.phone || '').replace(/\D/g, '').slice(-10)
    const existing =
      customers.find((c) => c.sourceId && String(c.sourceId) === String(row.sourceId)) ||
      (digits &&
        customers.find((c) => (c.phone || '').replace(/\D/g, '').slice(-10) === digits))

    // addCustomer hands the record straight back, so the call can open on it
    // in the same tick rather than waiting for a re-render.
    return existing || addCustomer(row)
  }

  const toggle = (no) =>
    setPicked((p) => (p.includes(no) ? p.filter((x) => x !== no) : [...p, no]))

  const { status, rows, total, error } = state

  return (
    <div>
      {/* -- cohort filter ------------------------------------------------ */}
      <div className="card mb-4 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="label mb-0">Segments</span>
          <div className="flex gap-2 text-xs font-medium">
            <button type="button" className="text-blue-600 hover:underline" onClick={() => setPicked(FOCUS)}>
              Focus four
            </button>
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => setPicked(segments.map((s) => s.no))}
            >
              All
            </button>
            <button type="button" className="text-gray-500 hover:underline" onClick={() => setPicked([])}>
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {segments.map((s) => {
            const on = picked.includes(s.no)
            return (
              <button
                key={s.no}
                type="button"
                title={`${s.orders} orders · ordered ${s.ordered}${s.campaign ? ` · ${s.campaign}` : ''}`}
                onClick={() => toggle(s.no)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  on ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.name}
                <span className={`ml-1 ${on ? 'text-blue-100' : 'text-gray-400'}`}>{s.people}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search name, email or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-2 text-[11px] text-gray-500">
          Priority weighs how close they are to their own reorder date, what their biggest order
          was, how many times they have repeated, and which cohort they sit in. Work down from the
          top.
        </p>
      </div>

      {/* -- the queue ---------------------------------------------------- */}
      {status === 'error' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {status === 'loading' && (
        <p className="flex items-center gap-2 py-8 text-sm text-gray-400">
          <i className="ti ti-loader-2 animate-spin" /> Building the queue…
        </p>
      )}

      {status === 'ready' && rows.length === 0 && (
        <EmptyState
          icon="ti-phone-check"
          title="Nobody matches those filters"
          hint={picked.length ? 'Widen the segments or clear the search.' : 'Pick at least one segment.'}
        />
      )}

      {status === 'ready' && rows.length > 0 && (
        <>
          <p className="mb-2 text-xs text-gray-500">
            {total.toLocaleString('en-IN')} in this queue · showing the top {rows.length}
          </p>
          <ul className="space-y-2">
            {rows.map((row, i) => (
              <QueueRow
                key={row.sourceId}
                row={row}
                rank={i + 1}
                store={store}
                onOpen={() => onOpenCustomer(ensureLocal(row).id)}
                onCall={() => onCall(ensureLocal(row).id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function QueueRow({ row, rank, store, onOpen, onCall }) {
  const due = dueLabel(row.dueInDays)
  const shopify = shopifyCustomerUrl(store, row.sourceId)

  const why = useMemo(() => {
    const s = row.scores || {}
    const parts = [
      { label: 'due', v: s.due },
      { label: 'value', v: s.value },
      { label: 'habit', v: s.habit },
      { label: 'frequency', v: s.frequency },
    ]
    return parts
      .filter((p) => p.v >= 0.6)
      .map((p) => p.label)
      .join(' · ')
  }, [row.scores])

  return (
    <li className="card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-6 shrink-0 text-center text-xs font-semibold text-gray-400">{rank}</span>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
          {initials(row.name)}
        </span>

        <div className="min-w-[12rem] flex-1">
          <button type="button" className="text-left" onClick={onOpen}>
            <span className="text-sm font-semibold text-gray-900 hover:text-blue-700">
              {row.name}
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
            <span className="badge bg-indigo-50 text-indigo-700">{row.segment}</span>
            <span>{maskPhone(row.phone)}</span>
            {row.city && <span>· {row.city}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Reorder</div>
            <div className={due.tone}>{due.text}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Orders</div>
            <div className="text-gray-900">{row.ordersCount}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Biggest order</div>
            <div className="text-gray-900">{rupees(row.maxOrder)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Last order</div>
            <div className="text-gray-900">{row.lastOrderDate ? fmtDate(row.lastOrderDate) : '—'}</div>
          </div>
          <div title={`due ${(row.scores?.due * 100).toFixed(0)}%, value ${(row.scores?.value * 100).toFixed(0)}%, habit ${(row.scores?.habit * 100).toFixed(0)}%, frequency ${(row.scores?.frequency * 100).toFixed(0)}%`}>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">Priority</div>
            <div className="font-semibold text-gray-900">
              {row.priority}
              {why && <span className="ml-1 font-normal text-[10px] text-gray-400">{why}</span>}
            </div>
          </div>
        </div>

        {/* Always on the row, never behind a hover or a menu — this is the
            one button the screen exists for. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {shopify ? (
            <a
              href={shopify}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              title="Open this customer in Shopify"
            >
              <i className="ti ti-brand-shopify" />
            </a>
          ) : (
            <span
              className="btn btn-sm cursor-not-allowed opacity-40"
              title="Set SHOPIFY_STORE in server/.env to link through to Shopify"
            >
              <i className="ti ti-brand-shopify" />
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={onOpen}>
            Open
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onCall}>
            <i className="ti ti-phone-call" />
            Call
          </button>
        </div>
      </div>
    </li>
  )
}
