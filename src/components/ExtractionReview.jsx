import React from 'react'
import { CONFIDENCE_TONES } from '../data/extract.js'

/**
 * Raw note → extracted → **human approves** → saved.
 *
 * Grouped by the card each value would land in, because the question the
 * caller is answering is "is this going to the right place?", and a flat list
 * of labels doesn't answer it. Nothing here writes on its own: every row
 * starts ticked but stays editable, and anything the extractor got wrong can
 * be corrected or unticked before the call is saved.
 */
export default function ExtractionReview({ fields, selected, onToggle, onEdit }) {
  if (!fields.length) return null

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <i className="ti ti-sparkles text-blue-600" />
        <span className="text-xs font-semibold text-blue-900">
          {fields.length} detail{fields.length === 1 ? '' : 's'} from your note, ready to file
        </span>
      </div>
      <p className="mb-3 text-[11px] text-blue-800">
        Each one goes to the field named under its section. Check what's right, fix what isn't —
        only ticked rows are written, and your note is kept whatever you do.
      </p>

      {groupBySection(fields).map(([section, rows]) => (
        <div key={section} className="mb-3 last:mb-0">
          <div className="mb-1 flex items-center gap-1.5">
            <i className="ti ti-arrow-narrow-right text-[11px] text-blue-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
              {section}
            </span>
          </div>
          <ul className="space-y-2">
            {rows.map((field) => {
          const isOn = selected.includes(field.key)
          return (
            <li
              key={field.key}
              className={`rounded-lg border bg-white p-2.5 transition ${
                isOn ? 'border-blue-300' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={isOn}
                  onChange={() => onToggle(field.key)}
                  aria-label={`Save ${field.label}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-900">{field.label}</span>
                    <span className={`badge ${CONFIDENCE_TONES[field.confidence]}`}>
                      {field.confidence}
                    </span>
                    <span className="badge bg-gray-100 text-gray-500">
                      {field.target === 'cat' ? 'Cat' : 'Customer'}
                    </span>
                  </div>

                  {field.editable === false ? (
                    <p className="mt-1 text-sm text-gray-800">{field.display}</p>
                  ) : (
                    <input
                      className="input mt-1.5 py-1 text-sm"
                      value={field.value}
                      disabled={!isOn}
                      onChange={(e) => onEdit(field.key, e.target.value)}
                    />
                  )}

                  <p className="mt-1 truncate text-[11px] italic text-gray-500">
                    matched: “{field.snippet}”
                  </p>
                </div>
              </div>
            </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * Keeps the sections in the order they appear on the customer page, so the
 * review reads like the screen the caller is about to look at.
 */
const SECTION_ORDER = [
  'Cats',
  'TrueHunt food experience',
  'General food experience',
  'Customer and family information',
]

function groupBySection(fields) {
  const groups = new Map()
  fields.forEach((f) => {
    const key = f.section || 'Other details'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  })

  return [...groups.entries()].sort(
    (a, b) =>
      (SECTION_ORDER.indexOf(a[0]) + 1 || 99) - (SECTION_ORDER.indexOf(b[0]) + 1 || 99)
  )
}
