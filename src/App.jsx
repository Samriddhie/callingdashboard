import React, { useMemo, useState } from 'react'
import Sidebar, { NAV_ITEMS } from './components/Sidebar.jsx'
import CallModal from './components/CallModal.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import CallQueuePage from './pages/CallQueuePage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import CustomerDetailPage from './pages/CustomerDetailPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import SubscriptionsPage from './pages/SubscriptionsPage.jsx'
import { useData } from './data/DataContext.jsx'
import { useAuth } from './auth/AuthContext.jsx'

export default function App() {
  const { customers, cats, tickets } = useData()
  const { user } = useAuth()

  const [page, setPage] = useState('dashboard')
  // The detail view takes over the content area while `page` stays put, so Back
  // returns to whichever list you came from.
  const [openCustomerId, setOpenCustomerId] = useState(null)
  const [callTargetId, setCallTargetId] = useState(null)

  const callTarget = customers.find((c) => c.id === callTargetId)
  const targetCats = useMemo(
    () => (callTarget ? cats.filter((c) => c.customerId === callTarget.id) : []),
    [cats, callTarget]
  )

  // Nothing is reachable without an identity — every call has to be attributable.
  if (!user) return <LoginScreen />

  const navigate = (next) => {
    setPage(next)
    setOpenCustomerId(null)
  }

  const followUpCount = tickets.filter((t) => t.status === 'pending').length

  const renderPage = () => {
    if (openCustomerId) {
      return (
        <CustomerDetailPage
          customerId={openCustomerId}
          onBack={() => setOpenCustomerId(null)}
          backLabel={NAV_ITEMS.find((n) => n.id === page)?.label}
          onCall={setCallTargetId}
        />
      )
    }

    switch (page) {
      case 'queue':
        return <CallQueuePage onOpenCustomer={setOpenCustomerId} onCall={setCallTargetId} />
      case 'customers':
        return <CustomersPage onOpenCustomer={setOpenCustomerId} onCall={setCallTargetId} />
      case 'history':
        return <HistoryPage onOpenCustomer={setOpenCustomerId} />
      case 'subscriptions':
        return <SubscriptionsPage onOpenCustomer={setOpenCustomerId} />
      default:
        return (
          <DashboardPage
            onOpenCustomer={setOpenCustomerId}
            onCall={setCallTargetId}
            onNavigate={navigate}
          />
        )
    }
  }

  return (
    <div className="flex h-full bg-canvas">
      <Sidebar page={page} onNavigate={navigate} followUpCount={followUpCount} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">{renderPage()}</div>
      </main>

      {callTarget && (
        <CallModal
          key={callTarget.id}
          customer={callTarget}
          cats={targetCats}
          onClose={() => setCallTargetId(null)}
        />
      )}
    </div>
  )
}
