import React, { useMemo } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { EmptyState } from '../components/Badges.jsx'
import { useData } from '../data/DataContext.jsx'
import { initials } from '../data/format.js'

const SECTIONS = [
  {
    key: 'interested',
    title: 'Interested',
    icon: 'ti-star',
    tone: 'bg-amber-50 text-amber-700',
    hint: 'Flagged on a call, not yet confirmed.',
  },
  {
    key: 'confirmed',
    title: 'Confirmed',
    icon: 'ti-circle-check',
    tone: 'bg-green-50 text-green-700',
    hint: 'Subscription agreed.',
  },
  {
    key: 'cancelled',
    title: 'Cancelled',
    icon: 'ti-circle-x',
    tone: 'bg-gray-100 text-gray-600',
    hint: 'Dropped out or declined.',
  },
]

const ACTIONS = {
  interested: [
    { to: 'confirmed', label: 'Confirm', icon: 'ti-check', primary: true },
    { to: 'cancelled', label: 'Cancel', icon: 'ti-x' },
  ],
  confirmed: [
    { to: 'interested', label: 'Back to interested', icon: 'ti-arrow-back-up' },
    { to: 'cancelled', label: 'Cancel', icon: 'ti-x' },
  ],
  cancelled: [
    { to: 'interested', label: 'Reopen', icon: 'ti-arrow-back-up' },
    { to: 'confirmed', label: 'Confirm', icon: 'ti-check', primary: true },
  ],
}

export default function SubscriptionsPage({ onOpenCustomer }) {
  const { customers, setSubscriptionStatus } = useData()

  const grouped = useMemo(() => {
    const buckets = { interested: [], confirmed: [], cancelled: [] }
    customers.forEach((c) => {
      if (c.subscriptionStatus === 'confirmed') buckets.confirmed.push(c)
      else if (c.subscriptionStatus === 'cancelled') buckets.cancelled.push(c)
      else if (c.subscriptionInterest) buckets.interested.push(c)
    })
    return buckets
  }, [customers])

  const total = grouped.interested.length + grouped.confirmed.length + grouped.cancelled.length

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle={`${total} customer${total === 1 ? '' : 's'} in the pipeline`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const list = grouped[section.key]
          return (
            <section key={section.key} className="card p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className={`badge ${section.tone}`}>
                  <i className={`ti ${section.icon} text-sm`} />
                  {section.title}
                </span>
                <span className="text-xs text-gray-500">{list.length}</span>
              </div>
              <p className="mb-3 text-xs text-gray-500">{section.hint}</p>

              {list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400">
                  Nobody here yet
                </div>
              ) : (
                <ul className="space-y-2">
                  {list.map((customer) => (
                    <li key={customer.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-50 text-[11px] font-semibold text-purple-700">
                          {initials(customer.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onOpenCustomer(customer.id)}
                            className="truncate text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
                          >
                            {customer.name}
                          </button>
                          <div className="truncate text-xs text-gray-500">
                            {customer.customerCode}
                            {customer.budget && ` · ₹${customer.budget}/mo`}
                          </div>
                        </div>
                      </div>

                      {customer.notes && (
                        <p className="mt-2 line-clamp-3 text-xs text-gray-600">{customer.notes}</p>
                      )}

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {ACTIONS[section.key].map((action) => (
                          <button
                            key={action.to}
                            type="button"
                            className={`btn btn-sm ${action.primary ? 'btn-primary' : ''}`}
                            onClick={() => setSubscriptionStatus(customer.id, action.to)}
                          >
                            <i className={`ti ${action.icon}`} />
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {total === 0 && (
        <div className="mt-4">
          <EmptyState
            icon="ti-refresh"
            title="No subscription interest recorded yet"
            hint="Tick it on a customer, or mention “subscription” in a call note and approve the suggestion."
          />
        </div>
      )}
    </div>
  )
}
