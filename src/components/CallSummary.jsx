import React from 'react'
import { CallOutcomeBadge } from './Badges.jsx'
import { extractInsights, TONES } from '../data/insights.js'
import { fmtDuration, fmtRelative } from '../data/format.js'

/**
 * The call story so far, on the main screen: counts, where the last call left
 * off, and what previous conversations add up to. The whole card opens the full
 * history — the detail is one click away rather than behind a tab you have to
 * remember to visit.
 */
export default function CallSummary({ customer, calls, notes, cats, ticket, onOpenHistory }) {
  const attempts = calls.filter((c) => c.status !== 'didntCall')
  const connected = calls.filter((c) => c.connectedAt)
  const lastCall = calls[0] || null
  const talkTime = connected.reduce((sum, c) => sum + (c.durationSec || 0), 0)

  const insights = extractInsights({ customer, calls, notes, cats, ticket })

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={onOpenHistory}
        className="flex w-full items-center justify-between gap-3 px-5 pt-5 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Calls</h2>
          <p className="text-xs text-gray-500">
            {calls.length ? 'Tap for the full history and notes' : 'Nothing logged yet'}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
          History
          <i className="ti ti-chevron-right" />
        </span>
      </button>

      <div className="grid grid-cols-4 gap-2 px-5 py-4">
        <Stat label="Attempts" value={attempts.length} />
        <Stat label="Connected" value={connected.length} />
        <Stat label="Talk time" value={fmtDuration(talkTime)} mono />
        <Stat label="Last call" value={fmtRelative(customer.lastCalledAt)} small />
      </div>

      {lastCall && (
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex w-full items-center gap-2 border-t border-gray-100 px-5 py-2.5 text-left transition hover:bg-gray-50"
        >
          <CallOutcomeBadge call={lastCall} />
          <span className="truncate text-xs text-gray-500">
            {lastCall.notes ? lastCall.notes : 'No note on the last call'}
          </span>
        </button>
      )}

      {insights.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <i className="ti ti-sparkles" />
            From previous calls
          </div>

          {insights.map((insight) => (
            <div
              key={insight.key}
              className={`rounded-lg border px-3 py-2 text-xs ${TONES[insight.tone] || TONES.gray}`}
            >
              <div className="flex gap-2">
                <i className={`ti ${insight.icon} mt-0.5 shrink-0`} />
                <div className="min-w-0">
                  <p className="font-medium">{insight.text}</p>
                  {insight.quote && (
                    <p className="mt-0.5 truncate italic opacity-80">“{insight.quote}”</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, mono, small }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={`mt-0.5 font-semibold text-gray-900 ${small ? 'text-sm' : 'text-lg'} ${
          mono ? 'font-mono tabular-nums' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}
