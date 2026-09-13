import React from 'react'
import Modal from './Modal.jsx'
import { CallOutcomeBadge, EmptyState } from './Badges.jsx'
import { fmtDateTime, fmtDuration } from '../data/format.js'

/**
 * The detail behind the call summary: every attempt, and the note it produced,
 * on one timeline. Calls and notes used to live in two separate tabs, which
 * meant reading a note required remembering which call it came from.
 */
export default function CallHistoryModal({ customer, calls, notes, onClose }) {
  const noteByCall = notes.reduce((acc, note) => {
    if (note.callId) acc[note.callId] = note
    return acc
  }, {})

  // Notes that outlived their call (deleted from history) still deserve showing.
  const orphanNotes = notes.filter((n) => !n.callId || !calls.some((c) => c.id === n.callId))

  return (
    <Modal
      width="max-w-2xl"
      title={`${customer.name} — call history`}
      subtitle={`${calls.length} logged · ${calls.filter((c) => c.connectedAt).length} connected`}
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      {calls.length === 0 && orphanNotes.length === 0 ? (
        <EmptyState
          icon="ti-phone"
          title="No calls logged yet"
          hint="Use the Call button to start the first attempt."
        />
      ) : (
        <ol className="space-y-3">
          {calls.map((call) => {
            const note = noteByCall[call.id]
            return (
              <li key={call.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CallOutcomeBadge call={call} />
                  <span className="text-xs text-gray-500">{fmtDateTime(call.initiatedAt)}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span>
                    <span className="text-gray-400">By </span>
                    {call.initiatedByName || '—'}
                  </span>
                  {call.connectedAt && (
                    <span>
                      <span className="text-gray-400">Talk time </span>
                      <span className="font-mono">{fmtDuration(call.durationSec)}</span>
                    </span>
                  )}
                  {call.completedAt && (
                    <span>
                      <span className="text-gray-400">Wrapped </span>
                      {fmtDateTime(call.completedAt)}
                    </span>
                  )}
                  {call.orderNumber && (
                    <span>
                      <span className="text-gray-400">Order </span>
                      <span className="font-medium text-gray-900">{call.orderNumber}</span>
                    </span>
                  )}
                </div>

                {call.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{call.notes}</p>
                )}

                {note?.appliedFields?.length > 0 && (
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">
                      Saved to fields
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {note.appliedFields.map((f) => (
                        <span key={f.key} className="badge bg-blue-50 text-blue-700">
                          {f.label}: {f.display || f.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}

          {orphanNotes.map((note) => (
            <li key={note.id} className="rounded-lg border border-dashed border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>{note.createdByName || 'Unknown'}</span>
                <span>{fmtDateTime(note.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{note.rawText}</p>
              <p className="mt-1 text-[11px] text-gray-400">Note kept after its call was deleted</p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
