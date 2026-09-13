import React, { useState } from 'react'
import { infoSource } from '../data/schema.js'
import { fmtDateTime, fmtRelative } from '../data/format.js'

/**
 * Fields that keep their past.
 *
 * The rule these enforce: answering a question a second time never erases the
 * first answer. What a customer said in June and what they say in September
 * are two facts about two moments, and the September one is not a correction —
 * it's the next reading. So the box below is always empty when you open it,
 * the existing entries sit above it read-only, and saving appends.
 *
 * Every entry shows when it was said, who wrote it down, and which interaction
 * it came out of — a call, a WhatsApp message, or someone typing it in.
 */

/* ------------------------------------------------------------------ */
/* One line of history                                                 */
/* ------------------------------------------------------------------ */

function EntryRow({ entry, showField = false }) {
  const src = infoSource(entry.source)

  return (
    <li className="rounded-md border border-gray-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
        <span className={`badge ${src.tone}`}>
          <i className={`ti ${src.icon}`} />
          {src.label}
        </span>
        {showField && <span className="font-medium text-gray-700">{entry.label}</span>}
        <span title={fmtDateTime(entry.occurredAt)}>{fmtRelative(entry.occurredAt)}</span>
        {entry.createdByName && <span>· {entry.createdByName}</span>}
        {entry.interactionId && (
          <span className="font-mono text-[10px] text-gray-400" title="Interaction ID">
            {entry.interactionId}
          </span>
        )}
      </div>

      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
        {entry.value || <span className="italic text-gray-400">cleared</span>}
      </p>

      {entry.previousValue ? (
        <p className="mt-1 text-[11px] text-gray-400">
          was <span className="line-through">{entry.previousValue}</span>
        </p>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* An append-only text field                                           */
/* ------------------------------------------------------------------ */

export default function InfoHistory({
  label,
  hint,
  placeholder,
  entries = [],
  onAdd,
  rows = 2,
}) {
  const [draft, setDraft] = useState('')
  const [showAll, setShowAll] = useState(false)

  const sorted = [...entries].sort(
    (a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)
  )
  const visible = showAll ? sorted : sorted.slice(0, 2)

  const add = () => {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }

  return (
    <div>
      <label className="label">
        {label}
        {hint && <span className="ml-1 font-normal normal-case text-gray-400">{hint}</span>}
        {sorted.length > 0 && (
          <span className="ml-1 font-normal normal-case text-gray-400">
            · {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </label>

      {sorted.length > 0 && (
        <>
          <ul className="mb-2 space-y-1.5">
            {visible.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
          {sorted.length > 2 && (
            <button
              type="button"
              className="mb-2 text-xs font-medium text-blue-600 hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show less' : `Show all ${sorted.length} entries`}
            </button>
          )}
        </>
      )}

      {/* Deliberately never pre-filled with the last answer: this box is for
          what they are saying now, not for editing what they said before. */}
      <textarea
        rows={rows}
        className="input resize-y"
        placeholder={sorted.length ? 'Add what they said this time…' : placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            add()
          }
        }}
      />

      {draft.trim() && (
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={add}>
            <i className="ti ti-plus" />
            Add entry
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setDraft('')}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The trail behind a field that only holds one value                  */
/* ------------------------------------------------------------------ */

/**
 * Dropdowns, chips and counters still hold a single current answer — a cat
 * either is on 2 packets a day or it isn't. Their past is shown underneath
 * rather than beside, as a record of when the answer changed and why.
 */
export function ChangeLog({ entries = [], showField = false }) {
  const [open, setOpen] = useState(false)

  const sorted = [...entries].sort(
    (a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)
  )
  if (!sorted.length) return null

  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-blue-600"
        onClick={() => setOpen((v) => !v)}
      >
        <i className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'}`} />
        {sorted.length} earlier {sorted.length === 1 ? 'answer' : 'answers'}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {sorted.map((entry) => (
            <EntryRow key={entry.id} entry={entry} showField={showField} />
          ))}
        </ul>
      )}
    </div>
  )
}

export { EntryRow }
