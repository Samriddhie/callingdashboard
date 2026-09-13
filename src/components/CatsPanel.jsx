import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACCEPTABILITY_TO_PALATABILITY,
  BUY_PLACES,
  CAT_BREEDS,
  MAX_CATS,
  OTHER_FOOD_BRANDS,
  PACKETS_PER_DAY,
  TRUEHUNT_ACCEPTABILITY,
} from '../data/schema.js'
import { useData } from '../data/DataContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import InfoHistory, { ChangeLog } from './InfoHistory.jsx'
import { fileToThumbnail } from '../data/photo.js'

/**
 * Everything the agent asks about the cats and the food, in the order a call
 * actually goes: who the cats are, how they took to TrueHunt, what else the
 * household feeds, and who the household is.
 *
 * Nothing here has a Save button. Every field writes as soon as it settles —
 * on change for a dropdown or a chip, on blur for anything typed — because a
 * form filled in mid-conversation is a form nobody remembers to submit.
 */
export default function CatsPanel({ customer, cats }) {
  const { addCat, updateCat, deleteCat, updateCustomer, recordInfo, infoEntries } = useData()
  const { user } = useAuth()

  const mine = useMemo(
    () => infoEntries.filter((e) => e.customerId === customer.id),
    [infoEntries, customer.id]
  )

  /**
   * Everything ever recorded for one field. Household facts carry no cat id;
   * anything said about a particular cat carries theirs, so the two never mix.
   */
  const entriesFor = (field, catId = null) =>
    mine.filter((e) => e.field === field && (e.catId || null) === catId)

  /**
   * Files a fact. Appends to the history and moves the field's current value
   * on in one step — the previous entry is left exactly as it was.
   */
  const record = ({ field, label, value, previousValue, flatValue, catId = null }) =>
    recordInfo({
      customerId: customer.id,
      catId,
      field,
      label,
      value,
      previousValue: previousValue || null,
      flatValue,
      source: 'manual',
      createdBy: user?.id || null,
      createdByName: user?.name || '',
    })

  // The flat write with no history behind it, for values the app derives for
  // itself rather than ones a customer told us.
  const setFlat = (catId, patch) =>
    catId ? updateCat(catId, patch) : updateCustomer(customer.id, patch)

  const shared = { customer, cats, entriesFor, record, setFlat }

  return (
    <>
      <CatsSection
        {...shared}
        onAdd={() => addCat({ customerId: customer.id })}
        onSaveCat={updateCat}
        onDeleteCat={deleteCat}
        onSaveCustomer={(patch) => updateCustomer(customer.id, patch)}
      />
      <TrueHuntExperienceSection {...shared} />
      <GeneralFoodSection {...shared} />
      <FamilySection {...shared} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Add a cat                                                        */
/* ------------------------------------------------------------------ */

function CatsSection({ customer, cats, entriesFor, record, onAdd, onSaveCat, onDeleteCat, onSaveCustomer }) {
  // Pick a number, get that many rows. Growing is free; shrinking past a row
  // that has something in it asks first, because the answer is usually a
  // mis-click on the dropdown rather than a cat that stopped existing.
  const setCount = (next) => {
    if (next > cats.length) {
      for (let i = cats.length; i < next; i += 1) onAdd()
      return
    }
    const doomed = cats.slice(next)
    if (!doomed.length) return
    if (doomed.some(hasSomethingInIt)) {
      const names = doomed.map((c) => c.name.trim() || 'an unnamed cat').join(', ')
      if (!window.confirm(`Remove ${names}? Everything recorded for them is deleted.`)) return
    }
    doomed.forEach((c) => onDeleteCat(c.id))
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Cats <span className="font-normal text-gray-400">({cats.length})</span>
          </h2>
          <p className="text-xs text-gray-500">Saved as you type — there is nothing to submit.</p>
        </div>
        <CustomerPhoto customer={customer} onChange={(photo) => onSaveCustomer({ photo })} />
      </div>

      <div className="max-w-[16rem]">
        <label className="label" htmlFor="cat-count">
          How many cats do you have?
        </label>
        <select
          id="cat-count"
          className="input"
          value={cats.length}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          {Array.from({ length: MAX_CATS + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Not asked yet' : n}
            </option>
          ))}
        </select>
      </div>

      {cats.length > 0 && (
        <div className="mt-3 space-y-2">
          {cats.map((cat, i) => (
            <CatRow
              key={cat.id}
              cat={cat}
              index={i}
              entriesFor={entriesFor}
              record={record}
              onSave={(patch) => onSaveCat(cat.id, patch)}
              onDelete={() => onDeleteCat(cat.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function hasSomethingInIt(cat) {
  return Boolean(
    cat.name.trim() ||
      cat.age.trim() ||
      cat.breed.trim() ||
      cat.foodAmountComment?.trim() ||
      (cat.trueHuntAcceptability && cat.trueHuntAcceptability !== 'unknown')
  )
}

function CatRow({ cat, index, entriesFor, record, onSave, onDelete }) {
  const label = cat.name.trim() || `Cat ${index + 1}`

  // An empty row goes without ceremony; one that has answers in it is worth a
  // question, because the delete takes those answers with it.
  const remove = () => {
    if (hasSomethingInIt(cat) && !window.confirm(`Remove ${label}? Everything recorded for them is deleted.`)) {
      return
    }
    onDelete()
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </h3>
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-red-600"
          onClick={remove}
        >
          <i className="ti ti-trash" />
          Remove cat
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <AutoInput
          label="Cat name"
          placeholder="Fluffy"
          value={cat.name}
          onCommit={(name) => onSave({ name })}
        />
        <AutoInput
          label="Cat age"
          placeholder="2 years"
          value={cat.age}
          onCommit={(age) => onSave({ age })}
        />
        <div className="col-span-2">
          <label className="label">Cat breed</label>
          <select
            className="input"
            value={CAT_BREEDS.includes(cat.breed) ? cat.breed : cat.breed ? 'Other' : ''}
            onChange={(e) =>
              record({
                field: 'breed',
                label: 'Cat breed',
                value: e.target.value,
                previousValue: cat.breed,
                catId: cat.id,
              })
            }
          >
            <option value="">Not known</option>
            {CAT_BREEDS.map((breed) => (
              <option key={breed} value={breed}>
                {breed}
              </option>
            ))}
          </select>
          <ChangeLog entries={entriesFor('breed', cat.id)} />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. TrueHunt food experience                                         */
/* ------------------------------------------------------------------ */

function TrueHuntExperienceSection({ customer, cats, entriesFor, record, setFlat }) {
  const [catId, setCatId] = useState('')

  // Follow the list rather than pin to an id: cats get added and removed while
  // this is open, and a selector pointing at a deleted cat renders nothing.
  const selected = cats.find((c) => c.id === catId) || cats[0] || null

  const likedLabel = (value) =>
    TRUEHUNT_ACCEPTABILITY.find((o) => o.value === value)?.label || value

  const saveLiked = (value) => {
    record({
      field: 'trueHuntAcceptability',
      label: 'Did your cat like the food?',
      value: likedLabel(value),
      previousValue: likedLabel(selected.trueHuntAcceptability || 'unknown'),
      flatValue: value,
      catId: selected.id,
    })
    // Derived from the answer above, so it gets no history entry of its own —
    // the timeline is for what the customer said, not for our bookkeeping.
    setFlat(selected.id, {
      palatability: ACCEPTABILITY_TO_PALATABILITY[value] || 'unknown',
    })
  }

  const liked = selected?.trueHuntAcceptability || 'unknown'

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-gray-900">TrueHunt food experience</h2>
      <p className="mb-3 text-xs text-gray-500">
        Asked per cat — two cats in the same house rarely agree about food.
      </p>

      {cats.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
          Add a cat above to record how it went.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="th-cat">
                Cat
              </label>
              <select
                id="th-cat"
                className="input"
                value={selected.id}
                onChange={(e) => setCatId(e.target.value)}
              >
                {cats.map((cat, i) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name.trim() || `Cat ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="th-liked">
                Did your cat like the food?
              </label>
              <select
                id="th-liked"
                className="input"
                value={liked}
                onChange={(e) => saveLiked(e.target.value)}
              >
                {TRUEHUNT_ACCEPTABILITY.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChangeLog entries={entriesFor('trueHuntAcceptability', selected.id)} />
            </div>
          </div>

          {/* One box, whichever way they answered. Yes, no and a little all
              want the same follow-up — why — and splitting it into three
              differently worded questions only made the form fussier. */}
          <InfoHistory
            key={selected.id}
            label="Any comment"
            placeholder="sniffed it and walked away… / finished the bowl in one go…"
            entries={entriesFor('catExperience', selected.id)}
            onAdd={(value) =>
              record({
                field: 'catExperience',
                label: 'Comment on the food',
                value,
                catId: selected.id,
              })
            }
          />
        </div>
      )}

      {/* The parent's own view, kept apart from the cat's. Both belong to the
          TrueHunt experience — they are about the food we sent, not about how
          the household feeds generally. */}
      <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
        <InfoHistory
          label="Feedback"
          hint="(from the parent — packaging, food smell, texture, ingredients, brand, pricing)"
          placeholder="pouch tears unevenly, smell is strong, dearer than what they were buying…"
          entries={entriesFor('overallExperience')}
          onAdd={(value) => record({ field: 'overallExperience', label: 'Feedback', value })}
        />

        <InfoHistory
          label="Benefits"
          hint="(anything they have noticed from it)"
          placeholder="coat is shinier, firmer stools, more energy, less fussy at mealtimes…"
          entries={entriesFor('benefitsNoticed')}
          onAdd={(value) => record({ field: 'benefitsNoticed', label: 'Benefits', value })}
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 3. General food experience                                          */
/* ------------------------------------------------------------------ */

function GeneralFoodSection({ customer, entriesFor, record }) {
  const dry = customer.dryBrands || []
  const wet = customer.wetBrands || []
  const places = customer.buysFrom || []

  const asText = (list) => list.join(', ') || 'none'

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-gray-900">General food experience</h2>
      <p className="mb-3 text-xs text-gray-500">
        Their cat’s feeding habits — what the household actually feeds, TrueHunt or not.
      </p>

      <div className="space-y-3">
        <InfoHistory
          label="What kind of food, and how often"
          hint="(the split between dry, wet, treats and home made)"
          placeholder="dry in the morning, wet at night, home cooked twice a week, treats when she yells…"
          entries={entriesFor('feedingSplit')}
          onAdd={(value) => record({ field: 'feedingSplit', label: 'Feeding split', value })}
        />

        <div>
          <span className="label">Brands of dry food</span>
          <ChipMulti
            options={OTHER_FOOD_BRANDS}
            selected={dry}
            onChange={(dryBrands) =>
              record({
                field: 'dryBrands',
                label: 'Dry food brands',
                value: asText(dryBrands),
                previousValue: asText(dry),
                flatValue: dryBrands,
              })
            }
            allowCustom
            customPlaceholder="Another dry brand…"
          />
          <ChangeLog entries={entriesFor('dryBrands')} />
        </div>

        <div>
          <span className="label">Brands of wet food</span>
          <ChipMulti
            options={OTHER_FOOD_BRANDS}
            selected={wet}
            onChange={(wetBrands) =>
              record({
                field: 'wetBrands',
                label: 'Wet food brands',
                value: asText(wetBrands),
                previousValue: asText(wet),
                flatValue: wetBrands,
              })
            }
            allowCustom
            customPlaceholder="Another wet brand…"
          />
          <ChangeLog entries={entriesFor('wetBrands')} />
        </div>

        <div className="max-w-[16rem]">
          <label className="label" htmlFor="packets-per-day">
            Wet food packets a day, whole household
          </label>
          <select
            id="packets-per-day"
            className="input"
            value={customer.packetsPerDay ?? ''}
            onChange={(e) =>
              record({
                field: 'packetsPerDay',
                label: 'Packets per day',
                value: e.target.value,
                previousValue: customer.packetsPerDay ?? '',
              })
            }
          >
            <option value="">Not asked yet</option>
            {PACKETS_PER_DAY.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChangeLog entries={entriesFor('packetsPerDay')} />
        </div>

        <div>
          <span className="label">Where do they buy from?</span>
          <ChipMulti
            options={BUY_PLACES}
            selected={places}
            onChange={(buysFrom) =>
              record({
                field: 'buysFrom',
                label: 'Buys from',
                value: asText(buysFrom),
                previousValue: asText(places),
                flatValue: buysFrom,
              })
            }
            allowCustom
            customPlaceholder="Somewhere else…"
          />
          <ChangeLog entries={entriesFor('buysFrom')} />
        </div>

        <InfoHistory
          label="Any specific cat behaviour, disease or habit"
          placeholder="kidney diet since March, hides when the bowl is refilled…"
          entries={entriesFor('catBehaviourNotes')}
          onAdd={(value) =>
            record({
              field: 'catBehaviourNotes',
              label: 'Cat behaviour, disease or habit',
              value,
            })
          }
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Customer and family information                                  */
/* ------------------------------------------------------------------ */

function FamilySection({ entriesFor, record }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-gray-900">Customer and family information</h2>
      <p className="mb-3 text-xs text-gray-500">
        Who is in the house, who feeds the cat, anything worth remembering next call.
      </p>
      <InfoHistory
        rows={3}
        label=""
        placeholder="lives with parents in Pune, her mother feeds the cats in the morning…"
        entries={entriesFor('familyInfo')}
        onAdd={(value) =>
          record({ field: 'familyInfo', label: 'Customer and family information', value })
        }
      />
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

/**
 * Multi-select as chips rather than a native <select multiple>, which needs a
 * modifier key nobody uses one-handed on a call. With `allowCustom` anything
 * typed becomes a chip too — regional brands outnumber the ones on any list.
 */
function ChipMulti({ options, selected, onChange, labelOf = (v) => v, allowCustom, customPlaceholder }) {
  const [draft, setDraft] = useState('')
  // Whatever was typed in earlier sits alongside the suggestions, so it can be
  // switched off again the same way it went on.
  const all = [...options, ...selected.filter((v) => !options.includes(v))]

  const toggle = (value) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  const addCustom = () => {
    const value = draft.trim()
    setDraft('')
    if (value && !selected.some((v) => v.toLowerCase() === value.toLowerCase())) {
      onChange([...selected, value])
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {all.map((value) => {
        const on = selected.includes(value)
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              on
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {labelOf(value)}
          </button>
        )
      })}

      {allowCustom && (
        <input
          className="min-w-[8rem] flex-1 border-0 bg-transparent py-1 text-xs outline-none placeholder:text-gray-400"
          placeholder={customPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addCustom()
            }
          }}
          onBlur={addCustom}
        />
      )}
    </div>
  )
}

/**
 * A text field that saves itself. Edits are held locally so storage isn't
 * written on every keystroke, then committed when the field settles — on blur,
 * or on unmount for the case where the panel goes away while it still has
 * focus. The refs keep that unmount effect free of deps: depending on the
 * draft would re-run it per keystroke, which is a loop rather than a save.
 */
function useAutosave(value, onCommit) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(draft)
  const valueRef = useRef(value)
  const commitRef = useRef(onCommit)
  draftRef.current = draft
  valueRef.current = value
  commitRef.current = onCommit

  useEffect(() => setDraft(value), [value])
  useEffect(
    () => () => {
      if (draftRef.current !== valueRef.current) commitRef.current(draftRef.current)
    },
    []
  )

  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return [draft, setDraft, commit]
}

function AutoInput({ label, placeholder, value, onCommit }) {
  const [draft, setDraft, commit] = useAutosave(value, onCommit)
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  )
}

function CustomerPhoto({ customer, onChange }) {
  const fileRef = useRef(null)
  const [error, setError] = useState('')

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      onChange(await fileToThumbnail(file))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="shrink-0 text-center">
      {customer.photo ? (
        <img src={customer.photo} alt="Customer's cats" className="h-14 w-14 rounded-lg object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300">
          <i className="ti ti-cat text-xl" />
        </span>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      <button
        type="button"
        className="mt-1 text-[11px] text-blue-600 hover:underline"
        onClick={() => fileRef.current?.click()}
      >
        {customer.photo ? 'Change' : 'Add photo'}
      </button>
      {customer.photo && (
        <button
          type="button"
          className="ml-1.5 mt-1 text-[11px] text-gray-400 hover:text-red-600"
          onClick={() => onChange('')}
        >
          Remove
        </button>
      )}
      {error && <p className="mt-1 w-24 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
