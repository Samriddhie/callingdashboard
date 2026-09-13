import React, { useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import NewCustomerModal from '../components/NewCustomerModal.jsx'
import { EmptyState } from '../components/Badges.jsx'
import { useData } from '../data/DataContext.jsx'
import { csvToCustomers, customersToCsv, downloadCsv } from '../data/csv.js'
import { fetchCrmCustomers } from '../data/api.js'
import { firstOrderDate } from '../data/metrics.js'
import { fmtDate, fmtRelative, initials, maskPhone } from '../data/format.js'

export default function CustomersPage({ onOpenCustomer, onCall }) {
  const { customers, cats, orders, calls, importCustomers, syncCustomers } = useData()
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [flash, setFlash] = useState(null)
  const [syncing, setSyncing] = useState(null)
  const fileRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      [c.name, c.customerCode, c.phone].some((f) => (f || '').toLowerCase().includes(q))
    )
  }, [customers, query])

  const byCustomer = useMemo(() => {
    const map = {}
    customers.forEach((c) => {
      map[c.id] = { cats: [], orders: [], calls: 0 }
    })
    cats.forEach((c) => map[c.customerId]?.cats.push(c))
    orders.forEach((o) => map[o.customerId]?.orders.push(o))
    calls.forEach((c) => {
      if (map[c.customerId] && c.status !== 'didntCall') map[c.customerId].calls += 1
    })
    return map
  }, [customers, cats, orders, calls])

  const handleExport = () => {
    downloadCsv(
      `truehunt-customers-${new Date().toISOString().slice(0, 10)}.csv`,
      customersToCsv({ customers, cats, orders, calls })
    )
  }

  // Pulls the CRM's callable customers in and upserts them. The heavy lifting
  // is the backend's — the browser has no route to Postgres.
  const handleSync = async () => {
    setSyncing({ done: 0, total: 0 })
    setFlash(null)
    try {
      const rows = await fetchCrmCustomers({
        onProgress: (done, total) => setSyncing({ done, total }),
      })
      const { created, updated } = syncCustomers(rows)
      setFlash({
        tone: 'ok',
        text: `Synced ${rows.length} customers from the database — ${created} new, ${updated} updated.`,
      })
    } catch (err) {
      console.error(err)
      setFlash({
        tone: 'error',
        text: `Could not reach the database: ${err.message}`,
      })
    } finally {
      setSyncing(null)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const rows = csvToCustomers(await file.text()).filter((r) => r.name || r.customerCode)
      if (!rows.length) {
        setFlash({ tone: 'error', text: 'No usable rows found in that CSV.' })
        return
      }
      const { created, merged } = importCustomers(rows)
      setFlash({ tone: 'ok', text: `Imported ${created} new, merged ${merged} existing.` })
    } catch (err) {
      console.error(err)
      setFlash({ tone: 'error', text: 'Could not read that file as CSV.' })
    }
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${customers.length} total`}>
        <button type="button" className="btn" onClick={handleExport} disabled={!customers.length}>
          <i className="ti ti-download" />
          Export CSV
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <i className="ti ti-upload" />
          Import CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImport}
        />
        <button type="button" className="btn" onClick={handleSync} disabled={Boolean(syncing)}>
          <i className={`ti ${syncing ? 'ti-loader-2 animate-spin' : 'ti-database'}`} />
          {syncing
            ? syncing.total
              ? `Syncing ${syncing.done}/${syncing.total}…`
              : 'Syncing…'
            : 'Sync from database'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
          <i className="ti ti-plus" />
          New customer
        </button>
      </PageHeader>

      {flash && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            flash.tone === 'ok'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <span>{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss">
            <i className="ti ti-x" />
          </button>
        </div>
      )}

      <div className="relative mb-4">
        <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search by name, customer ID or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={customers.length ? 'ti-search-off' : 'ti-users'}
          title={customers.length ? 'No customers match that search' : 'No customers yet'}
          hint={
            customers.length
              ? 'Try a different name, customer ID or phone number.'
              : 'Add your first customer, or import an existing list from CSV.'
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5" />
                <th className="px-4 py-2.5 font-semibold">Last called</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Phone</th>
                <th className="px-4 py-2.5 font-semibold">City</th>
                <th className="px-4 py-2.5 font-semibold">Cats</th>
                <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
                <th className="px-4 py-2.5 text-right font-semibold">Spent</th>
                <th className="px-4 py-2.5 font-semibold">Last order</th>
                <th className="px-4 py-2.5 text-right font-semibold">Calls</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((customer) => {
                const bundle = byCustomer[customer.id] || { cats: [], orders: [], calls: 0 }
                return (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    bundle={bundle}
                    onOpen={() => onOpenCustomer(customer.id)}
                    onCall={() => onCall(customer.id)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewCustomerModal
          onClose={() => setShowNew(false)}
          onCreated={(c) => onOpenCustomer(c.id)}
        />
      )}
    </div>
  )
}

const rupees = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

function CustomerRow({ customer, bundle, onOpen, onCall }) {
  const { deleteCustomer } = useData()
  const [confirming, setConfirming] = useState(false)

  // Synced customers carry their Shopify order count; their individual orders
  // are not copied into local rows, so bundle.orders would read zero.
  const orderCount = customer.sourceId ? customer.ordersCount || 0 : bundle.orders.length
  const lastOrderedOn = customer.lastOrderDate || firstOrderDate(bundle.orders)

  const remove = (e) => {
    e.stopPropagation()
    if (!confirming) {
      setConfirming(true)
      return
    }
    deleteCustomer(customer.id)
  }

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="cursor-pointer transition hover:bg-blue-50/40"
    >
      {/* First column, not last: the table scrolls sideways on a laptop and
          the one action every row exists for was ending up off the edge. */}
      <td className="px-4 py-2.5">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={(e) => {
            e.stopPropagation()
            onCall()
          }}
        >
          <i className="ti ti-phone" />
          Call
        </button>
      </td>

      <td
        className={`whitespace-nowrap px-4 py-2.5 ${
          customer.lastCalledAt ? 'text-gray-600' : 'font-medium text-blue-700'
        }`}
      >
        {fmtRelative(customer.lastCalledAt)}
      </td>

      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
            {initials(customer.name)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-gray-900">{customer.name}</span>
              {customer.subscriptionInterest && (
                <i
                  className="ti ti-refresh text-sm text-purple-600"
                  title="Interested in a subscription"
                />
              )}
            </div>
            <div className="truncate text-xs text-gray-500">{customer.customerCode}</div>
          </div>
        </div>
      </td>

      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{maskPhone(customer.phone)}</td>
      <td className="px-4 py-2.5 text-gray-600">{customer.city || '—'}</td>

      <td className="max-w-[160px] px-4 py-2.5 text-gray-600">
        <span className="block truncate">
          {bundle.cats.length ? bundle.cats.map((c) => c.name || 'Unnamed').join(', ') : '—'}
        </span>
      </td>

      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{orderCount}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
        {customer.sourceId ? rupees(customer.totalSpent) : '—'}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
        {lastOrderedOn ? fmtDate(lastOrderedOn) : '—'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{bundle.calls}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={remove}
            onBlur={() => setConfirming(false)}
            aria-label={confirming ? 'Confirm delete' : 'Delete customer'}
            className={`rounded-lg px-2 py-1 text-xs transition ${
              confirming
                ? 'bg-red-600 text-white'
                : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
            }`}
          >
            {confirming ? 'Sure?' : <i className="ti ti-trash" />}
          </button>
        </div>
      </td>
    </tr>
  )
}
