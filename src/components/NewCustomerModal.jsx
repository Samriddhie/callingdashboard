import React, { useState } from 'react'
import Modal from './Modal.jsx'
import { useData } from '../data/DataContext.jsx'
import { fromInputValue, toDateInputValue } from '../data/format.js'

export default function NewCustomerModal({ onClose, onCreated }) {
  const { addCustomer, addCat, addOrder } = useData()
  const [form, setForm] = useState({
    customerCode: '',
    name: '',
    phone: '',
    signupDate: toDateInputValue(new Date().toISOString()),
    catName: '',
    packetsPerDay: '',
    previousBrand: '',
    orderNumber: '',
    orderDate: toDateInputValue(new Date().toISOString()),
  })
  const [errors, setErrors] = useState({})

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (!form.customerCode.trim()) next.customerCode = 'Customer ID is required'
    setErrors(next)
    if (Object.keys(next).length) return

    const customer = addCustomer({
      customerCode: form.customerCode,
      name: form.name,
      phone: form.phone,
      signupDate: fromInputValue(form.signupDate),
    })

    if (form.catName.trim()) {
      addCat({
        customerId: customer.id,
        name: form.catName,
        packetsPerDay: form.packetsPerDay,
        previousBrand: form.previousBrand,
      })
    }

    if (form.orderNumber.trim()) {
      addOrder({
        customerId: customer.id,
        orderNumber: form.orderNumber,
        orderDate: fromInputValue(form.orderDate),
      })
    }

    onCreated?.(customer)
    onClose()
  }

  return (
    <Modal
      title="New customer"
      subtitle="Customer ID and name are required. Cat and order can be added later."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-customer-form" className="btn btn-primary">
            <i className="ti ti-plus" />
            Add customer
          </button>
        </>
      }
    >
      <form id="new-customer-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="customerCode">
              Customer ID *
            </label>
            <input
              id="customerCode"
              className="input"
              placeholder="CUST-491"
              value={form.customerCode}
              onChange={set('customerCode')}
            />
            {errors.customerCode && (
              <p className="mt-1 text-xs font-medium text-red-600">{errors.customerCode}</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="name">
              Name *
            </label>
            <input
              id="name"
              className="input"
              placeholder="Priya Nair"
              value={form.name}
              onChange={set('name')}
            />
            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              className="input"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={set('phone')}
            />
          </div>
          <div>
            <label className="label" htmlFor="signupDate">
              Signed up on
            </label>
            <input
              id="signupDate"
              type="date"
              className="input"
              value={form.signupDate}
              onChange={set('signupDate')}
            />
            <p className="mt-1 text-[11px] text-gray-500">Used for Days to First Order.</p>
          </div>
        </div>

        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-xs font-medium text-gray-600">First order</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="orderNumber">
                Order number
              </label>
              <input
                id="orderNumber"
                className="input"
                placeholder="TH-1042"
                value={form.orderNumber}
                onChange={set('orderNumber')}
              />
            </div>
            <div>
              <label className="label" htmlFor="orderDate">
                Order date
              </label>
              <input
                id="orderDate"
                type="date"
                className="input"
                value={form.orderDate}
                onChange={set('orderDate')}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-xs font-medium text-gray-600">First cat</legend>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="catName">
                Cat name
              </label>
              <input
                id="catName"
                className="input"
                placeholder="Fluffy"
                value={form.catName}
                onChange={set('catName')}
              />
            </div>
            <div>
              <label className="label" htmlFor="packetsPerDay">
                Packets / day
              </label>
              <input
                id="packetsPerDay"
                type="number"
                min="0"
                step="0.5"
                className="input"
                placeholder="2"
                value={form.packetsPerDay}
                onChange={set('packetsPerDay')}
              />
            </div>
            <div>
              <label className="label" htmlFor="previousBrand">
                Previous brand
              </label>
              <input
                id="previousBrand"
                className="input"
                placeholder="Whiskas"
                value={form.previousBrand}
                onChange={set('previousBrand')}
              />
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
