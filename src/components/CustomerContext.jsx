import React, { useEffect, useMemo, useState } from 'react'
import { fetchBrief, fetchCustomerOrders, fetchSegment } from '../data/api.js'
import { fmtDate } from '../data/format.js'
import { dispositionMeta } from '../data/schema.js'

/* ------------------------------------------------------------------ */
/* Where this customer sits, and where they have been                  */
/* ------------------------------------------------------------------ */

/**
 * The cohort is the first thing a caller needs: it says what this call is for.
 * Ringing a repeat active to nudge a reorder and ringing a lapsed first-timer
 * to find out what went wrong are different conversations.
 *
 * The trail underneath is the part a snapshot can't tell you — someone who has
 * just slid from Active to Cooling is a different call from someone who has sat
 * in Cooling for months.
 */
export function SegmentInline({ phone }) {
  const [state, setState] = useState({ status: 'idle', current: null, history: [], error: '' })
  const [showTrail, setShowTrail] = useState(false)

  useEffect(() => {
    if (!phone) {
      setState({ status: 'nophone', current: null, history: [], error: '' })
      return undefined
    }
    const controller = new AbortController()
    setState({ status: 'loading', current: null, history: [], error: '' })
    fetchSegment(phone, { signal: controller.signal })
      .then((d) => setState({ status: 'ready', current: d.current, history: d.history, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setState({ status: 'error', current: null, history: [], error: err.message })
      })
    return () => controller.abort()
  }, [phone])

  const { status, current, history } = state

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">Segment</div>

      {status === 'loading' && <div className="text-sm text-gray-300">…</div>}
      {(status === 'error' || status === 'nophone' || (status === 'ready' && !current)) && (
        <div className="text-sm text-gray-400">—</div>
      )}

      {current && (
        <>
          <div className="text-lg font-semibold leading-tight text-gray-900">{current.segment}</div>
          <div className="text-[11px] text-gray-500">
            {current.orders} order{current.orders === 1 ? '' : 's'}
            {current.recencyDays != null ? ` · ${current.recencyDays}d since last` : ''}
            {history.length > 0 && (
              <button
                type="button"
                className="ml-1 font-medium text-blue-600 hover:underline"
                onClick={() => setShowTrail((v) => !v)}
              >
                {showTrail ? 'hide' : 'history'}
              </button>
            )}
          </div>

          {/* The trail is the part a snapshot can't tell you — someone who has
              just slid from Active to Cooling is a different call from someone
              who has sat in Cooling for months. */}
          {showTrail && history.length > 0 && (
            <ol className="mt-2 space-y-1 border-l border-gray-200 pl-2">
              {history.map((h, i) => (
                <li key={`${h.segment}-${h.since}`} className="text-[11px] leading-snug">
                  <span className={i === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}>
                    {h.segment}
                  </span>
                  <span className="text-gray-400">
                    {' '}
                    {fmtDate(h.since)}
                    {h.until ? ` → ${fmtDate(h.until)}` : ' → now'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The pre-call brief                                                  */
/* ------------------------------------------------------------------ */

/**
 * Two questions, answered from everything on file: what should I know, and
 * what should I ask.
 *
 * A caller has maybe fifteen seconds between deciding to ring and the customer
 * picking up. In that time they cannot read an order history, four call notes
 * and a page of feedback — so this reads them instead and says what matters
 * for this call. It is a starting point, not a script: everything it says is
 * traceable to the sections below it.
 */
export function PreCallBrief({ customer, cats, calls, notes, infoEntries }) {
  const [state, setState] = useState({ status: 'idle', summary: [], questions: [], error: '' })

  // Assembled here rather than server-side: the local record holds things the
  // CRM has never seen — cats, feedback, what was said on our own calls.
  const context = useMemo(() => {
    const said = notes.slice(0, 8).map((n) => ({
      at: n.createdAt,
      by: n.createdByName,
      note: n.rawText,
    }))

    return {
      customer: {
        name: customer.name,
        city: customer.city,
        customerSince: customer.signupDate,
        status: customer.status,
        ordersOnFile: customer.ordersCount,
        totalSpent: customer.totalSpent,
        lastOrderDate: customer.lastOrderDate,
        lastCalledAt: customer.lastCalledAt,
        doNotCall: customer.doNotCall,
        budget: customer.budget,
        subscriptionInterest: customer.subscriptionInterest,
      },
      cats: cats.map((c) => ({
        name: c.name,
        age: c.age,
        breed: c.breed,
        trueHuntAcceptability: c.trueHuntAcceptability,
        foodAmountComment: c.foodAmountComment,
      })),
      household: {
        currentFoodTypes: customer.currentFoodTypes,
        packetsPerDay: customer.packetsPerDay,
        otherBrands: customer.otherBrands,
        catBehaviour: customer.catBehaviourNotes,
        family: customer.familyInfo,
      },
      feedback: infoEntries.slice(0, 25).map((e) => ({
        field: e.label,
        value: e.value,
        source: e.source,
        at: e.occurredAt,
      })),
      calls: calls.slice(0, 10).map((c) => ({
        at: c.initiatedAt,
        outcome: dispositionMeta(c.disposition)?.label || c.status,
        talkTimeSec: c.durationSec,
        orderNumber: c.orderNumber || undefined,
      })),
      callNotes: said,
    }
  }, [customer, cats, calls, notes, infoEntries])

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', summary: [], questions: [], error: '' })
    fetchBrief(context, { signal: controller.signal })
      .then((d) =>
        setState({ status: 'ready', summary: d.summary, questions: d.questions, error: '' })
      )
      .catch((err) => {
        if (err.name === 'AbortError') return
        setState({ status: 'error', summary: [], questions: [], error: err.message })
      })
    return () => controller.abort()
    // Re-briefing on every keystroke elsewhere would be wasteful; the customer
    // changing is the only thing that should trigger a fresh read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

  const { status, summary, questions, error } = state

  const retry = () => {
    setState({ status: 'loading', summary: [], questions: [], error: '' })
    fetchBrief(context)
      .then((d) =>
        setState({ status: 'ready', summary: d.summary, questions: d.questions, error: '' })
      )
      .catch((err) => setState({ status: 'error', summary: [], questions: [], error: err.message }))
  }

  return (
    <section className="card border-blue-100 bg-blue-50/30 p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <i className="ti ti-sparkles text-blue-600" />
          Before you call
        </h2>
        {status !== 'loading' && (
          <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={retry}>
            Refresh
          </button>
        )}
      </div>

      {status === 'loading' && (
        <p className="flex items-center gap-2 py-2 text-xs text-gray-500">
          <i className="ti ti-loader-2 animate-spin" /> Reading their history…
        </p>
      )}

      {status === 'error' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      )}

      {status === 'ready' && (
        <div className="space-y-3">
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              What to know
            </h3>
            {summary.length ? (
              <ul className="space-y-1">
                {summary.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-gray-800">
                    <i className="ti ti-point-filled mt-0.5 shrink-0 text-blue-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">Not enough on file to say anything useful yet.</p>
            )}
          </div>

          {questions.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Worth asking
              </h3>
              <ul className="space-y-1">
                {questions.map((q) => (
                  <li key={q} className="flex gap-2 text-sm text-gray-800">
                    <i className="ti ti-help-circle mt-0.5 shrink-0 text-blue-400" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            Written from the record below — check anything surprising against it before repeating it
            to the customer.
          </p>
        </div>
      )}
    </section>
  )
}
