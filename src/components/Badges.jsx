import React from 'react'
import {
  CALL_STATES,
  DELIVERY_STATUSES,
  dispositionMeta,
  EATS_OPTIONS,
  NOT_CONNECTED_REASONS,
} from '../data/schema.js'

export function StatusBadge({ status }) {
  const meta = CALL_STATES[status]
  if (!meta) return null
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>
}

export function DispositionBadge({ disposition }) {
  const meta = dispositionMeta(disposition)
  if (!meta) return null
  return (
    <span className={`badge ${meta.tone}`}>
      <i className={`ti ${meta.icon} text-sm`} />
      {meta.label}
    </span>
  )
}

export function ReasonBadge({ reason }) {
  const meta = NOT_CONNECTED_REASONS.find((r) => r.value === reason)
  if (!meta) return null
  return (
    <span className="badge bg-red-50 text-red-700">
      <i className={`ti ${meta.icon} text-sm`} />
      {meta.label}
    </span>
  )
}

export function DeliveryBadge({ status }) {
  const meta = DELIVERY_STATUSES.find((s) => s.value === status)
  if (!meta) return null
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>
}

export function EatsBadge({ eats }) {
  const meta = EATS_OPTIONS.find((o) => o.value === eats)
  if (!meta) return null
  return (
    <span className={`badge ${meta.tone}`}>
      <i className={`ti ${meta.icon} text-sm`} />
      {meta.label}
    </span>
  )
}

/** The outcome of a finished call, in one badge, however it ended. */
export function CallOutcomeBadge({ call }) {
  if (!call) return null
  if (call.status === 'completed' && call.disposition)
    return <DispositionBadge disposition={call.disposition} />
  if (call.status === 'notConnected')
    return call.notConnectedReason ? (
      <ReasonBadge reason={call.notConnectedReason} />
    ) : (
      <StatusBadge status="notConnected" />
    )
  return <StatusBadge status={call.status} />
}

export function EmptyState({ icon = 'ti-inbox', title, hint, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <i className={`ti ${icon} mb-2 text-2xl text-gray-300`} />
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-gray-500">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
