import React, { useState } from 'react'
import { DELIVERY_STATUSES } from '../data/schema.js'
import { DeliveryBadge } from './Badges.jsx'
import { fmtDate, fromInputValue, toDateInputValue } from '../data/format.js'
import { useData } from '../data/DataContext.jsx'

export default function OrdersPanel({ customerId, orders }) {
  const { addOrder, updateOrder, deleteOrder } = useData()
  const [editingId, setEditingId] = useState(null)

  const sorted = [...orders].sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))

  const startNew = () => {
    const order = addOrder({ customerId, orderNumber: '' })
    setEditingId(order.id)
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Orders <span className="font-normal text-gray-400">({orders.length})</span>
        </h2>
        <button type="button" className="btn btn-sm" onClick={startNew}>
          <i className="ti ti-plus" />
          Add order
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
          No orders recorded yet
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((order) =>
            editingId === order.id ? (
              <OrderForm
                key={order.id}
                order={order}
                onSave={(patch) => {
                  updateOrder(order.id, patch)
                  setEditingId(null)
                }}
                onCancel={() => {
                  if (!order.orderNumber.trim()) deleteOrder(order.id)
                  setEditingId(null)
                }}
                onDelete={() => {
                  deleteOrder(order.id)
                  setEditingId(null)
                }}
              />
            ) : (
              <li
                key={order.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {order.orderNumber || 'No order number'}
                    </span>
                    <DeliveryBadge status={order.deliveryStatus} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-gray-600">
                    <span>
                      <span className="text-gray-400">Ordered </span>
                      {fmtDate(order.orderDate)}
                    </span>
                    {order.deliveryDate && (
                      <span>
                        <span className="text-gray-400">Delivered </span>
                        {fmtDate(order.deliveryDate)}
                      </span>
                    )}
                    {order.amount !== '' && order.amount != null && <span>₹{order.amount}</span>}
                  </div>
                  {order.items && <p className="mt-1 text-xs text-gray-600">{order.items}</p>}
                </div>
                <button
                  type="button"
                  className="btn btn-sm shrink-0"
                  onClick={() => setEditingId(order.id)}
                >
                  <i className="ti ti-pencil" />
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  )
}

function OrderForm({ order, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    orderNumber: order.orderNumber || '',
    orderDate: toDateInputValue(order.orderDate),
    deliveryStatus: order.deliveryStatus || 'pending',
    deliveryDate: order.deliveryDate ? toDateInputValue(order.deliveryDate) : '',
    amount: order.amount ?? '',
    items: order.items || '',
  })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = () =>
    onSave({
      ...form,
      orderDate: fromInputValue(form.orderDate) || order.orderDate,
      deliveryDate: form.deliveryDate ? fromInputValue(form.deliveryDate) : null,
    })

  return (
    <li className="rounded-lg border border-blue-300 bg-blue-50/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Order number</label>
          <input
            className="input"
            placeholder="TH-1042"
            value={form.orderNumber}
            onChange={set('orderNumber')}
          />
        </div>
        <div>
          <label className="label">Order date</label>
          <input type="date" className="input" value={form.orderDate} onChange={set('orderDate')} />
        </div>
        <div>
          <label className="label">Delivery status</label>
          <select className="input" value={form.deliveryStatus} onChange={set('deliveryStatus')}>
            {DELIVERY_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Delivery date</label>
          <input
            type="date"
            className="input"
            value={form.deliveryDate}
            onChange={set('deliveryDate')}
          />
        </div>
        <div>
          <label className="label">Amount (₹)</label>
          <input type="number" min="0" className="input" value={form.amount} onChange={set('amount')} />
        </div>
        <div>
          <label className="label">Items</label>
          <input
            className="input"
            placeholder="2kg salmon pack"
            value={form.items}
            onChange={set('items')}
          />
        </div>
      </div>
      <div className="mt-2 flex justify-between gap-2">
        <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>
          <i className="ti ti-trash" />
          Remove
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </li>
  )
}
