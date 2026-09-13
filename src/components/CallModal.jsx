import React, { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import ExtractionReview from './ExtractionReview.jsx'
import { CALL_STATES, DISPOSITIONS, NOT_CONNECTED_REASONS, makeCall } from '../data/schema.js'
import { extractFromNote } from '../data/extract.js'
import { fmtDateTime, fmtDuration, fromInputValue, toInputValue } from '../data/format.js'
import { useData } from '../data/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Values that are a free-text guess get an editable box; the rest are fixed
// choices where a text input would only invite typos.
const EDITABLE_KEYS = new Set(['previousBrand', 'packetsPerDay', 'catName', 'budget'])

const NOTES_PLACEHOLDER =
  'Type it however you say it — e.g. "Fluffy was on Whiskas before, eats 2 packets a day, ' +
  'loves this one. Gives it as a treat. Wants to reorder in 3 weeks, interested in subscription, budget ₹500."'

function defaultCallbackTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toInputValue(d.toISOString())
}

/**
 * The popup runs four distinct events, and keeps them distinct:
 *
 *   1. Call clicked      → the number is revealed          (phase 'reveal')
 *   2. Agent dials       → timestamped, still nothing written
 *   3. Outcome reported  → connected / not connected       (phase 'connected' | 'notConnected')
 *   4. Call ends         → disposition + notes are saved   (phase 'wrapup')
 *
 * Nothing is written to `calls` until step 3. Seeing a phone number is not the
 * same as phoning someone, so opening this popup and closing it again leaves no
 * trace — otherwise every mis-click would inflate the attempt count. The row is
 * created by whichever outcome is reported first, carrying the dial time from
 * step 2 when there was one.
 */
export default function CallModal({ customer, cats, onClose, onCompleted }) {
  const { registerCall, advanceCall, finalizeCall, noteEntries } = useData()
  const { user } = useAuth()

  // Step 1 happened the moment this mounted — worth stamping, but only onto a
  // record that some later step actually creates.
  const revealedAtRef = useRef(new Date().toISOString())

  // Set if they used the Dial link, so the record can carry the moment the call
  // was really placed rather than the moment the outcome was reported.
  const dialledAtRef = useRef(null)

  // Created lazily on the first reported outcome, so `callRef.current` being
  // null is the honest answer to "has anything been recorded yet?".
  const callRef = useRef(null)

  const [phase, setPhase] = useState('reveal') // reveal | connected | notConnected | wrapup
  const [status, setStatus] = useState('revealed') // mirrors CALL_STATES
  const [connectedAt, setConnectedAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)

  const [reason, setReason] = useState(null)
  const [disposition, setDisposition] = useState(null)
  const [notes, setNotes] = useState('')
  const [scheduleFor, setScheduleFor] = useState(defaultCallbackTime)
  const [orderNumber, setOrderNumber] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  // Everything said on previous calls, newest first. Read-only on purpose — it
  // is context for this call, never a starting draft for the new note.
  //
  // Closed until asked for: an agent who reads last call's note first tends to
  // confirm it rather than ask, and the answer that comes back is the old one
  // repeated. The bar below says how much history exists without showing any
  // of it, so checking is a decision rather than the default.
  const previousNotes = useMemo(
    () =>
      noteEntries
        .filter((n) => n.customerId === customer.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [noteEntries, customer.id]
  )

  // Extraction state, kept separate so re-scanning never clobbers manual edits.
  const [rawFields, setRawFields] = useState([])
  const [overrides, setOverrides] = useState({})
  const [dropped, setDropped] = useState([])
  const [extracting, setExtracting] = useState(false)

  /* -- live call timer ------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'connected' || !connectedAt) return undefined
    const tick = () => setElapsed(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, connectedAt])

  /* -- debounced extraction ------------------------------------------- */
  // Runs while the agent types during the call as well as in wrap-up, so the
  // review list is already populated by the time they hang up.
  // extractFromNote is async (it calls the backend, with a rule-based fallback
  // baked in) — `cancelled` stops a slow, stale request from overwriting fields
  // from whatever the agent has typed since.
  useEffect(() => {
    if (phase !== 'connected' && phase !== 'wrapup') return undefined
    let cancelled = false
    const id = setTimeout(async () => {
      setExtracting(true)
      try {
        const result = await extractFromNote(notes, { cats })
        if (!cancelled) setRawFields(result)
      } finally {
        if (!cancelled) setExtracting(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [notes, phase, cats])

  const fields = useMemo(
    () =>
      rawFields.map((f) => ({
        ...f,
        value: overrides[f.key] ?? f.value,
        editable: EDITABLE_KEYS.has(f.key),
      })),
    [rawFields, overrides]
  )

  const selectedKeys = fields.map((f) => f.key).filter((k) => !dropped.includes(k))

  /* -- transitions ----------------------------------------------------- */

  /**
   * Creates the `calls` row on first use, and only on first use. Everything that
   * writes goes through here, so there is exactly one place where a record can
   * come into existence — and revealing the number is not one of its callers.
   */
  const ensureCallRecord = () => {
    if (!callRef.current) {
      callRef.current = makeCall({
        customerId: customer.id,
        phoneNumber: customer.phone,
        initiatedBy: user?.id || null,
        initiatedByName: user?.name || 'Unknown',
        revealedAt: revealedAtRef.current,
        // When they actually dialled, if we saw it — not when they got round to
        // reporting the outcome.
        initiatedAt: dialledAtRef.current,
      })
      registerCall(callRef.current)
    }
    return callRef.current
  }

  /**
   * Step 2. Following the Dial link places the call, so this is the moment the
   * attempt happens — but it stays a timestamp, not a record. Nothing is written
   * until step 3 says what came of it.
   */
  const noteDialled = () => {
    dialledAtRef.current ||= new Date().toISOString()
  }

  /**
   * Step 3, and the first thing here that writes anything. In a telephony
   * integration these two are driven by the provider's status callback rather
   * than by a click; the UI only ever reflects a status, it never assumes one.
   */
  const markConnected = () => {
    const now = Date.now()
    const record = ensureCallRecord()
    setConnectedAt(now)
    setStatus('connected')
    setPhase('connected')
    advanceCall(record.id, {
      status: 'connected',
      connectedAt: new Date(now).toISOString(),
    })
  }

  const markNotConnected = () => {
    ensureCallRecord()
    setStatus('initiated')
    setPhase('notConnected')
    setError('')
  }

  const endCall = () => {
    const secs = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : 0
    setDuration(secs)
    setStatus('ended')
    setPhase('wrapup')
    advanceCall(callRef.current.id, {
      status: 'ended',
      endedAt: new Date().toISOString(),
      durationSec: secs,
    })
  }

  /* -- terminal writes -------------------------------------------------- */
  const saveNotConnected = () => {
    if (!reason) {
      setError('Pick why it didn’t connect.')
      return
    }
    finalizeCall({
      callId: callRef.current.id,
      status: 'notConnected',
      notConnectedReason: reason,
      notes: notes.trim(),
      durationSec: 0,
      user,
    })
    onCompleted?.()
    onClose()
  }

  const saveWrapup = () => {
    if (!disposition) {
      setError('Pick how the call went before saving.')
      return
    }
    if (disposition === 'callback' && !scheduleFor) {
      setError('Pick when to call back.')
      return
    }
    if (disposition === 'ordered' && !orderNumber.trim()) {
      setError('Enter the order number they gave you.')
      return
    }
    finalizeCall({
      callId: callRef.current.id,
      status: 'completed',
      disposition,
      notes: notes.trim(),
      durationSec: duration,
      scheduleFor: disposition === 'callback' ? fromInputValue(scheduleFor) : null,
      orderNumber,
      approved: fields.filter((f) => selectedKeys.includes(f.key)),
      user,
    })
    onCompleted?.()
    onClose()
  }

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(customer.phone)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy — select the number manually.')
    }
  }

  const stateMeta = CALL_STATES[status]
  const showsNumber = phase === 'reveal'

  /* -- footer per phase -------------------------------------------------- */
  let footer
  if (phase === 'reveal') {
    footer = (
      <>
        <button type="button" className="btn btn-danger mr-auto" onClick={onClose}>
          <i className="ti ti-x" />
          Close
        </button>
        <button type="button" className="btn" onClick={markNotConnected}>
          <i className="ti ti-phone-off" />
          Not connected
        </button>
        <button type="button" className="btn btn-primary" onClick={markConnected}>
          <i className="ti ti-phone-check" />
          Connected
        </button>
      </>
    )
  } else if (phase === 'connected') {
    footer = (
      <button type="button" className="btn btn-primary" onClick={endCall}>
        <i className="ti ti-phone-end" />
        End call
      </button>
    )
  } else if (phase === 'notConnected') {
    footer = (
      <>
        <button type="button" className="btn mr-auto" onClick={() => setPhase('reveal')}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={saveNotConnected}>
          Save
        </button>
      </>
    )
  } else {
    footer = (
      <button type="button" className="btn btn-primary" onClick={saveWrapup}>
        <i className="ti ti-check" />
        Save call
      </button>
    )
  }

  return (
    <Modal
      // Free to close while nothing has been recorded; locked the moment an
      // attempt exists, because an attempt has to end in a logged outcome.
      dismissible={phase === 'reveal'}
      width="max-w-xl"
      title={customer.name}
      subtitle={`${customer.customerCode} · call by ${user?.name || 'Unknown'}`}
      onClose={onClose}
      footer={footer}
      headerRight={
        <div className="flex items-center gap-2">
          {phase === 'connected' && (
            <span className="font-mono text-sm font-semibold tabular-nums text-green-700">
              {fmtDuration(elapsed)}
            </span>
          )}
          <span className={`badge ${stateMeta.tone}`}>{stateMeta.label}</span>
        </div>
      }
    >
      {showsNumber && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
            Customer number
          </div>
          <div className="font-mono text-xl font-semibold tracking-tight text-gray-900">
            {customer.phone || 'No number on file'}
          </div>
          {customer.phone && (
            <div className="mt-2 flex justify-center gap-2">
              {/* Following this link is the real "call attempt initiated" event,
                  so it is what logs the attempt — not the popup opening. */}
              <a
                className="btn btn-sm"
                href={`tel:${customer.phone.replace(/\s/g, '')}`}
                onClick={noteDialled}
              >
                <i className="ti ti-phone" />
                Dial
              </a>
              <button type="button" className="btn btn-sm" onClick={copyNumber}>
                <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'reveal' && (
        <p className="text-sm text-gray-600">
          {stateMeta.hint} Ring them, then say what happened —{' '}
          <span className="font-medium">Connected</span> or{' '}
          <span className="font-medium">Not connected</span>. Closing now records nothing at all.
        </p>
      )}

      {phase === 'connected' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-center">
            <div className="font-mono text-3xl font-semibold tabular-nums text-green-800">
              {fmtDuration(elapsed)}
            </div>
            <p className="mt-1 text-sm text-green-800">Call in progress with {customer.name}.</p>
            <p className="mt-0.5 text-xs text-green-700">
              Take notes as you talk. You pick how it went after you end the call.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="live-notes">
                Notes <span className="font-normal text-gray-400">(while you talk)</span>
              </label>
              {extracting && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <i className="ti ti-loader-2 animate-spin" />
                  Reading your note…
                </span>
              )}
            </div>
            <textarea
              id="live-notes"
              rows={4}
              className="input resize-y"
              placeholder={NOTES_PLACEHOLDER}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Kept as you type — these carry straight into the wrap-up.
            </p>
          </div>
        </div>
      )}

      {phase === 'notConnected' && (
        <div className="space-y-3">
          <div>
            <span className="label">Why didn’t it connect?</span>
            <div className="grid grid-cols-2 gap-2">
              {NOT_CONNECTED_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    setReason(r.value)
                    setError('')
                  }}
                  className={`btn justify-start ${
                    reason === r.value ? 'border-blue-600 bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  <i className={`ti ${r.icon}`} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="nc-notes">
              Note <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="nc-notes"
              rows={2}
              className="input resize-y"
              placeholder="e.g. number rings out every time, try the alternate number"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {phase === 'wrapup' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-600">Talk time</span>
            <span className="font-mono font-semibold tabular-nums text-gray-900">
              {fmtDuration(duration)}
            </span>
          </div>

          {/* The note comes first: it is what the agent is already holding in
              their head as the call ends, and asking for a disposition before
              they've written it down loses the detail. */}
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="wrap-notes">
                Notes
              </label>
              {extracting && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <i className="ti ti-loader-2 animate-spin" />
                  Reading your note…
                </span>
              )}
            </div>
            <textarea
              id="wrap-notes"
              rows={4}
              className="input resize-y"
              placeholder={NOTES_PLACEHOLDER}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* The note is read once the call ends and its facts are laid out
              against the columns they would fill. Nothing is written until the
              caller ticks them off and saves. */}
          <ExtractionReview
            fields={fields}
            selected={selectedKeys}
            onToggle={(key) =>
              setDropped((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]))
            }
            onEdit={(key, value) => setOverrides((o) => ({ ...o, [key]: value }))}
          />

          <div>
            <span className="label">Are they interested to buy? *</span>
            <div className="flex flex-wrap gap-2">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => {
                    setDisposition(d.value)
                    setError('')
                  }}
                  className={`btn ${
                    disposition === d.value ? 'border-blue-600 bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  <i className={`ti ${d.icon}`} />
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {disposition === 'interested' && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <i className="ti ti-clock-plus" /> Follow-up booked automatically for{' '}
              <strong>{fmtDateTime(new Date(Date.now() + 2 * 86400000).toISOString())}</strong> —
              two days from now.
            </p>
          )}

          {disposition === 'ordered' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <label className="label text-blue-800" htmlFor="order-number">
                Order number *
              </label>
              <input
                id="order-number"
                className="input"
                placeholder="#5867"
                value={orderNumber}
                onChange={(e) => {
                  setOrderNumber(e.target.value)
                  setError('')
                }}
              />
              <p className="mt-1.5 text-xs text-blue-700">
                What they read out to you — it gets reconciled against Shopify later.
              </p>
            </div>
          )}

          {disposition === 'callback' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="label text-amber-800" htmlFor="cb-time">
                Call back on *
              </label>
              <input
                id="cb-time"
                type="datetime-local"
                className="input"
                value={scheduleFor}
                onChange={(e) => {
                  setScheduleFor(e.target.value)
                  setError('')
                }}
              />
              <p className="mt-1.5 text-xs text-amber-700">
                Adds them to Follow-ups and counts the attempt.
              </p>
            </div>
          )}

          {disposition === 'doNotCall' && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <i className="ti ti-phone-off" /> They asked not to be called. They stay on file, but
              they will not appear in any call queue again.
            </p>
          )}
        </div>
      )}

      {/* What was said last time, on every screen — it is the thing an agent
          most often needs mid-sentence, and hunting for it in the customer page
          means leaving a live call. */}
      {previousNotes.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setShowNotes((v) => !v)}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <i className="ti ti-history" />
              Previous notes ({previousNotes.length})
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
              {showNotes ? 'Hide' : 'Show'}
              <i className={`ti ${showNotes ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
            </span>
          </button>

          {!showNotes && (
            <p className="mt-1 text-[11px] text-gray-400">
              Hidden while you call — ask first, read after.
            </p>
          )}

          {showNotes && (
            <>
              {previousNotes.length > 2 && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-600 hover:underline"
                    onClick={() => setShowAllNotes((v) => !v)}
                  >
                    {showAllNotes ? 'Show less' : `Show all ${previousNotes.length}`}
                  </button>
                </div>
              )}

              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                {(showAllNotes ? previousNotes : previousNotes.slice(0, 2)).map((note) => (
                  <div key={note.id} className="rounded-md border border-gray-200 bg-white p-2.5">
                    <div className="text-[11px] text-gray-500">
                      {note.createdByName || 'Unknown'} · {fmtDateTime(note.createdAt)}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{note.rawText}</p>
                    {note.appliedFields?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {note.appliedFields.map((f) => (
                          <span key={f.key} className="badge bg-blue-50 text-blue-700">
                            {f.label}: {f.display || f.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
    </Modal>
  )
}
