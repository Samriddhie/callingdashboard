import React, { useEffect, useState } from 'react'
import { fetchCustomerOrders } from '../data/api.js'
import { fmtDate, fmtRelative } from '../data/format.js'

const rupees = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

/**
 * Everything Shopify knows about this customer, as a read-only summary.
 *
 * The stored fields come from the CRM sync; the order list is fetched on open
 * rather than copied, so it can't drift out of date. Nothing here is editable —
 * Shopify owns these facts, and a calling tool editing them would only create a
 * second version of the truth.
 */
export default function ShopifySummary({ customer }) {
  const [orders, setOrders] = useState({ status: 'idle', rows: [], error: '' })

  useEffect(() => {
    if (!customer.sourceId) {
      setOrders({ status: 'unlinked', rows: [], error: '' })
      return undefined
    }

    const controller = new AbortController()
    setOrders({ status: 'loading', rows: [], error: '' })

    fetchCustomerOrders(customer.sourceId, { signal: controller.signal })
      .then((rows) => setOrders({ status: 'ready', rows, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setOrders({ status: 'error', rows: [], error: err.message })
      })

    return () => controller.abort()
  }, [customer.sourceId])

  const facts = [
    ['Customer', customer.name || '—'],
    ['Email', customer.email || '—'],
    ['City', customer.city || '—'],
    ['Orders', customer.sourceId ? (customer.ordersCount ?? 0) : '—'],
    ['Total spent', customer.sourceId ? rupees(customer.totalSpent) : '—'],
    ['Last order', customer.lastOrderDate ? fmtDate(customer.lastOrderDate) : '—'],
    ['Last called', fmtRelative(customer.lastCalledAt)],
  ]

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Customer summary</h2>
        {orders.status === 'loading' && (
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <i className="ti ti-loader-2 animate-spin" />
            Loading orders…
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500">
        {customer.sourceId
          ? 'From Shopify. Read-only — edit it in Shopify, not here.'
          : 'Added here rather than synced, so Shopify has no record to show.'}
      </p>

      <dl className="divide-y divide-gray-100 border-y border-gray-100">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="truncate text-sm font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Orders {orders.status === 'ready' && `(${orders.rows.length})`}
        </h3>

        {orders.status === 'error' && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {orders.error}
          </p>
        )}

        {(orders.status === 'unlinked' ||
          (orders.status === 'ready' && orders.rows.length === 0)) && (
          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-xs text-gray-400">
            No Shopify orders on file
          </p>
        )}

        {orders.status === 'ready' && orders.rows.length > 0 && (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {orders.rows.map((order) => (
              <li key={order.sourceId} className="rounded-lg border border-gray-200 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{order.orderNumber}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {rupees(order.total)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">{fmtDate(order.orderDate)}</span>
                  {order.financialStatus && (
                    <span
                      className={`badge ${
                        order.financialStatus === 'paid'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {order.financialStatus}
                    </span>
                  )}
                  <span
                    className={`badge ${
                      order.deliveryStatus === 'fulfilled'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {order.deliveryStatus || 'unfulfilled'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
