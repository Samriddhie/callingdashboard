import React from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { initials } from '../data/format.js'

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { id: 'queue', label: 'Call queue', icon: 'ti-phone-outgoing' },
  { id: 'customers', label: 'Customers', icon: 'ti-users' },
  { id: 'history', label: 'Call history', icon: 'ti-history' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'ti-refresh' },
]

export default function Sidebar({ page, onNavigate, followUpCount = 0 }) {
  const { user, signOut } = useAuth()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <i className="ti ti-phone text-base" />
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight text-gray-900">CallDesk</div>
          <div className="text-[11px] leading-tight text-gray-500">TrueHunt Cat Foods</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <i className={`ti ${item.icon} text-base`} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'queue' && followUpCount > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  {followUpCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="m-3 rounded-lg border border-gray-200 p-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-medium text-white">
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-900">{user?.name}</div>
            <div className="truncate text-[11px] text-gray-500">Product Management</div>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 w-full rounded-md px-2 py-1 text-left text-[11px] text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
        >
          <i className="ti ti-logout mr-1" />
          Switch user
        </button>
      </div>
    </aside>
  )
}
