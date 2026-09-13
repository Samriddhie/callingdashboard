import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadDb, saveDb } from './storage.js'
import {
  ACCEPTABILITY_TO_PALATABILITY,
  FEEDBACK_TOPICS,
  dispositionMeta,
  makeCall,
  makeCat,
  makeCustomer,
  makeInfoEntry,
  makeNoteEntry,
  makeOrder,
  makeTicket,
  makeUser,
} from './schema.js'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [db, setDb] = useState(loadDb)

  useEffect(() => {
    saveDb(db)
  }, [db])

  const api = useMemo(() => {
    const upsert = (collection, id, patch) =>
      setDb((d) => ({
        ...d,
        [collection]: d[collection].map((row) => (row.id === id ? { ...row, ...patch } : row)),
      }))

    /* ---- users ------------------------------------------------------- */
    const addUser = (input) => {
      const user = makeUser(input)
      setDb((d) => ({ ...d, users: [...d.users, user] }))
      return user
    }

    /* ---- customers --------------------------------------------------- */
    const addCustomer = (input) => {
      const customer = makeCustomer(input)
      setDb((d) => ({ ...d, customers: [customer, ...d.customers] }))
      return customer
    }

    const updateCustomer = (id, patch) => upsert('customers', id, patch)

    /* ---- information history ----------------------------------------- */

    /**
     * Writes one fact to the append-only history and updates the flat current
     * value on the customer or cat it belongs to.
     *
     * Nothing here overwrites history: the previous entry stays exactly where
     * it was, and the new one records what it replaced. The flat field is a
     * cache of "what is true now" so list views and the CSV export don't have
     * to walk the timeline; the entries are the record.
     */
    const recordInfo = (input) => {
      const entry = makeInfoEntry(input)
      if (!entry.field || entry.value == null) return null
      // Clearing an answer is itself a fact worth dating, but only when there
      // was an answer there to clear.
      if (entry.value === '' && !entry.previousValue) return null

      // A chip field's history reads best as "Dry food, Treat" while the field
      // itself has to stay an array — `flatValue` lets the two differ.
      const flat = input.flatValue !== undefined ? input.flatValue : entry.value

      setDb((d) => {
        const next = { ...d, infoEntries: [entry, ...d.infoEntries] }

        if (entry.catId) {
          next.cats = d.cats.map((c) => (c.id === entry.catId ? { ...c, [entry.field]: flat } : c))
        } else if (entry.customerId) {
          next.customers = d.customers.map((c) =>
            c.id === entry.customerId ? { ...c, [entry.field]: flat } : c
          )
        }

        return next
      })

      return entry
    }

    // Deleting a customer removes everything hanging off them, so no page ever
    // renders a row pointing at a customer that no longer exists.
    const deleteCustomer = (id) =>
      setDb((d) => ({
        ...d,
        customers: d.customers.filter((c) => c.id !== id),
        cats: d.cats.filter((c) => c.customerId !== id),
        orders: d.orders.filter((o) => o.customerId !== id),
        calls: d.calls.filter((c) => c.customerId !== id),
        noteEntries: d.noteEntries.filter((n) => n.customerId !== id),
        infoEntries: d.infoEntries.filter((e) => e.customerId !== id),
        tickets: d.tickets.filter((t) => t.customerId !== id),
      }))

    /* ---- cats -------------------------------------------------------- */
    const addCat = (input) => {
      const cat = makeCat(input)
      setDb((d) => ({ ...d, cats: [...d.cats, cat] }))
      return cat
    }
    const updateCat = (id, patch) => upsert('cats', id, patch)
    const deleteCat = (id) => setDb((d) => ({ ...d, cats: d.cats.filter((c) => c.id !== id) }))

    /* ---- orders ------------------------------------------------------ */
    const addOrder = (input) => {
      const order = makeOrder(input)
      setDb((d) => ({ ...d, orders: [...d.orders, order] }))
      return order
    }
    const updateOrder = (id, patch) => upsert('orders', id, patch)
    const deleteOrder = (id) =>
      setDb((d) => ({ ...d, orders: d.orders.filter((o) => o.id !== id) }))

    /* ---- call lifecycle ---------------------------------------------- */

    /**
     * Step 1 of the state machine. The attempt is stored the moment the agent
     * clicks Call — before anyone picks up — so clicking the button is recorded
     * as an *attempt*, never as a completed call.
     *
     * Takes an already-built call so the caller can hold a stable reference.
     * Idempotent by id, which keeps React StrictMode's double-invoked effects
     * from inserting the same attempt twice.
     */
    const registerCall = (call) =>
      setDb((d) => (d.calls.some((c) => c.id === call.id) ? d : { ...d, calls: [call, ...d.calls] }))

    /** Intermediate transitions: connected, ended. */
    const advanceCall = (callId, patch) => upsert('calls', callId, patch)

    /**
     * Terminal write. Closes the call, reconciles the callback ticket, stamps
     * the customer, and stores the raw note plus whatever the agent approved
     * out of the extraction.
     */
    const finalizeCall = ({
      callId,
      status,
      notConnectedReason,
      disposition,
      notes,
      durationSec,
      scheduleFor,
      orderNumber = '',
      feedback = [],
      approved = [],
      user,
    }) => {
      const completedAt = new Date().toISOString()

      // "Interested to buy" books its own follow-up. An agent who has just been
      // told yes is about to dial the next number, and the reorder window is a
      // couple of days wide — leaving the booking to memory loses the sale.
      const autoFollowUpDays = dispositionMeta(disposition)?.followUpDays || 0
      const followUpAt =
        scheduleFor ||
        (autoFollowUpDays
          ? new Date(Date.now() + autoFollowUpDays * 86400000).toISOString()
          : null)

      setDb((d) => {
        const call = d.calls.find((c) => c.id === callId)
        if (!call) return d

        const customerId = call.customerId

        const nextCall = {
          ...call,
          status,
          notConnectedReason: notConnectedReason || null,
          disposition: disposition || null,
          orderNumber: orderNumber.trim(),
          notes: notes || '',
          durationSec: durationSec ?? call.durationSec ?? 0,
          endedAt: call.endedAt || completedAt,
          completedAt,
        }

        /* -- callback ticket ------------------------------------------- */
        let tickets = d.tickets
        // Either the agent booked a time or the disposition earned one.
        const wantsCallback = Boolean(followUpAt) && disposition !== 'doNotCall'
        const open = d.tickets.find((t) => t.customerId === customerId && t.status === 'pending')

        if (wantsCallback) {
          tickets = open
            ? d.tickets.map((t) =>
                t.id === open.id
                  ? {
                      ...t,
                      attemptCount: t.attemptCount + 1,
                      scheduledFor: followUpAt,
                      lastCallId: callId,
                      notes: notes || t.notes,
                    }
                  : t
              )
            : [
                ...d.tickets,
                makeTicket({ customerId, lastCallId: callId, scheduledFor: followUpAt, notes }),
              ]
        } else if (status === 'completed') {
          // We reached them and they didn't ask for a callback — thread closed.
          tickets = d.tickets.map((t) =>
            t.customerId === customerId && t.status === 'pending' ? { ...t, status: 'completed' } : t
          )
        } else if (open && status === 'notConnected') {
          // Couldn't reach them: keep the ticket open, but count the attempt.
          tickets = d.tickets.map((t) =>
            t.id === open.id ? { ...t, attemptCount: t.attemptCount + 1, lastCallId: callId } : t
          )
        }

        /* -- approved extraction --------------------------------------- */
        let customers = d.customers
        let cats = d.cats

        const customerPatch = {}
        const catPatch = {}
        let newCatName = null

        // Chip fields hold arrays; the model and the note both speak in
        // comma-separated words.
        const LIST_FIELDS = new Set(['dryBrands', 'wetBrands', 'buysFrom'])
        const toList = (value) =>
          String(value)
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)

        // "They have three cats" is an instruction to make room for three, not
        // a value to store in a column.
        let wantedCats = 0

        approved.forEach((field) => {
          if (field.target === 'customer') {
            if (field.key === 'catCount') {
              wantedCats = Number(field.value) || 0
            } else if (field.key === 'subscriptionInterest') {
              customerPatch.subscriptionInterest = field.value === 'true'
            } else if (LIST_FIELDS.has(field.key)) {
              customerPatch[field.key] = toList(field.value)
            } else {
              customerPatch[field.key] = field.value
            }
          } else if (field.target === 'cat') {
            if (field.key === 'catName') newCatName = field.value
            else catPatch[field.key] = field.value
          }
        })

        // Keep the coarse flag the call insights read in step with the answer.
        if (catPatch.trueHuntAcceptability) {
          catPatch.palatability =
            ACCEPTABILITY_TO_PALATABILITY[catPatch.trueHuntAcceptability] || 'unknown'
        }

        // Feedback filed by topic moves that column on as well as landing in
        // the history — the panel reads the entries, but the CSV export and
        // the call insights read the flat value.
        feedback
          .filter((f) => f.text?.trim())
          .forEach((f) => {
            customerPatch[f.field] = f.text.trim()
          })

        // "Ordered" is a real signal about the relationship, so reflect it.
        if (disposition === 'ordered') customerPatch.status = 'active'

        // A request not to be called is the one wrap-up that changes what the
        // tool is allowed to do next, so it is stored on the customer and not
        // left buried in the last call's disposition.
        if (disposition === 'doNotCall') {
          customerPatch.doNotCall = true
          customerPatch.status = 'lost'
        }

        if (status !== 'didntCall') customerPatch.lastCalledAt = completedAt

        if (Object.keys(customerPatch).length) {
          customers = d.customers.map((c) => (c.id === customerId ? { ...c, ...customerPatch } : c))
        }

        if (wantedCats > 0) {
          const have = (cats === d.cats ? d.cats : cats).filter(
            (c) => c.customerId === customerId
          ).length
          if (wantedCats > have) {
            const extra = Array.from({ length: wantedCats - have }, () =>
              makeCat({ customerId })
            )
            cats = [...(cats === d.cats ? d.cats : cats), ...extra]
          }
        }

        if (newCatName || Object.keys(catPatch).length) {
          const pool = cats === d.cats ? d.cats : cats
          const existing = pool.filter((c) => c.customerId === customerId)
          const namedMatch =
            newCatName && existing.find((c) => c.name.toLowerCase() === newCatName.toLowerCase())

          if (newCatName && !namedMatch) {
            // A named cat with no record yet: if blank rows were just created
            // for a stated cat count, name the first one rather than adding
            // another alongside it.
            const blank = existing.find((c) => !c.name.trim())
            cats = blank
              ? pool.map((c) =>
                  c.id === blank.id ? { ...c, name: newCatName, ...catPatch } : c
                )
              : [...pool, makeCat({ customerId, name: newCatName, ...catPatch })]
          } else {
            // Apply cat-level facts to the named cat, else the only cat on file.
            const target = namedMatch || (existing.length === 1 ? existing[0] : null)
            if (target) {
              cats = pool.map((c) => (c.id === target.id ? { ...c, ...catPatch } : c))
            } else if (Object.keys(catPatch).length && !existing.length) {
              cats = [...pool, makeCat({ customerId, name: 'Cat', ...catPatch })]
            }
          }
        }

        /* -- raw note, kept verbatim ----------------------------------- */
        // The note is the source record and is never rewritten. It is also not
        // where the information lives: nobody reads six months of notes before
        // a call, so everything approved out of it is filed into the structured
        // columns below, each entry carrying the call it was said on.
        const note = notes?.trim()
          ? makeNoteEntry({
              customerId,
              callId,
              rawText: notes,
              appliedFields: approved.map((f) => ({
                key: f.key,
                label: f.label,
                value: f.value,
                display: f.display,
              })),
              createdBy: user?.id || null,
              createdByName: user?.name || '',
            })
          : null

        const noteEntries = note ? [note, ...d.noteEntries] : d.noteEntries

        /* -- the same facts, filed by field ---------------------------- */
        const catTarget = (() => {
          const existing = cats.filter((c) => c.customerId === customerId)
          if (newCatName) {
            const named = existing.find(
              (c) => c.name.toLowerCase() === newCatName.toLowerCase()
            )
            if (named) return named.id
          }
          return existing.length === 1 ? existing[0].id : null
        })()

        const infoEntries = [
          // Feedback the agent filed by topic while the customer was talking.
          // Same store as the customer page, tied back to this call.
          ...feedback
            .filter((f) => f.text?.trim())
            .map((f) =>
              makeInfoEntry({
                customerId,
                field: f.field,
                label:
                  f.label || FEEDBACK_TOPICS.find((t) => t.key === f.field)?.label || f.field,
                value: f.text.trim(),
                source: 'call',
                callId,
                noteId: note?.id || null,
                occurredAt: call.connectedAt || call.initiatedAt || completedAt,
                createdBy: user?.id || null,
                createdByName: user?.name || '',
              })
            ),
          ...approved.map((field) =>
            makeInfoEntry({
              customerId,
              catId: field.target === 'cat' ? catTarget : null,
              field: field.key,
              label: field.label,
              value: field.display || String(field.value),
              source: 'call',
              callId,
              noteId: note?.id || null,
              // What the customer said happened on the call, not whenever the
              // wrap-up form was finally submitted.
              occurredAt: call.connectedAt || call.initiatedAt || completedAt,
              createdBy: user?.id || null,
              createdByName: user?.name || '',
            })
          ),
          ...d.infoEntries,
        ]

        return {
          ...d,
          customers,
          cats,
          calls: d.calls.map((c) => (c.id === callId ? nextCall : c)),
          tickets,
          noteEntries,
          infoEntries,
        }
      })
    }

    /**
     * Erases a call from the record, along with the note it produced — the call
     * and its note are one event, and keeping the note would orphan it in the
     * customer's timeline. A pending callback ticket survives: the follow-up is
     * still owed to the customer, it just loses its pointer to the deleted call.
     */
    const deleteCall = (callId) =>
      setDb((d) => ({
        ...d,
        calls: d.calls.filter((c) => c.id !== callId),
        noteEntries: d.noteEntries.filter((n) => n.callId !== callId),
        // The facts the call produced go with it. They are attributed to an
        // interaction that no longer happened, and leaving them would strand
        // entries pointing at a missing call id.
        infoEntries: d.infoEntries.filter((e) => e.callId !== callId),
        tickets: d.tickets.map((t) => (t.lastCallId === callId ? { ...t, lastCallId: null } : t)),
      }))

    /* ---- subscriptions ------------------------------------------------ */
    const setSubscriptionStatus = (customerId, status) =>
      upsert('customers', customerId, {
        subscriptionStatus: status,
        subscriptionInterest: status !== 'cancelled',
      })

    /* ---- CRM sync ------------------------------------------------------ */
    /**
     * Upserts customers pulled from the CRM database (the Shopify sync).
     *
     * Matching is by Shopify id first, then by the last 10 digits of the phone
     * number. That order matters: re-syncing has to update the same person
     * rather than clone them, and someone typed in by hand should get linked to
     * their CRM row instead of sitting beside it as a duplicate.
     *
     * Only CRM-owned fields are overwritten — everything the caller has
     * gathered (cats, budget, feedback, notes) is left exactly as it was.
     */
    const syncCustomers = (rows) => {
      const result = { created: 0, updated: 0 }

      setDb((d) => {
        const customers = [...d.customers]
        const bySource = new Map()
        const byPhone = new Map()

        customers.forEach((c, i) => {
          if (c.sourceId) bySource.set(String(c.sourceId), i)
          const digits = (c.phone || '').replace(/\D/g, '').slice(-10)
          if (digits && !byPhone.has(digits)) byPhone.set(digits, i)
        })

        let created = 0
        let updated = 0

        rows.forEach((row) => {
          const digits = (row.phone || '').replace(/\D/g, '').slice(-10)
          const idx = bySource.has(String(row.sourceId))
            ? bySource.get(String(row.sourceId))
            : digits
              ? byPhone.get(digits)
              : undefined

          if (idx === undefined) {
            const customer = makeCustomer(row)
            customers.push(customer)
            bySource.set(String(row.sourceId), customers.length - 1)
            if (digits) byPhone.set(digits, customers.length - 1)
            created += 1
            return
          }

          const patch = {}
          const own = [
            'sourceId',
            'customerCode',
            'name',
            'phone',
            'email',
            'city',
            'signupDate',
            'lastOrderDate',
            'ordersCount',
            'totalSpent',
          ]
          own.forEach((key) => {
            const value = row[key]
            if (value !== undefined && value !== null && value !== '') patch[key] = value
          })

          customers[idx] = { ...customers[idx], ...patch }
          updated += 1
        })

        // Assigned, not accumulated — StrictMode runs this twice in dev, and a
        // double count would be reported to the user.
        result.created = created
        result.updated = updated

        return { ...d, customers }
      })

      return result
    }

    /* ---- CSV import --------------------------------------------------- */
    const importCustomers = (rows) => {
      let created = 0
      let merged = 0

      setDb((d) => {
        const customers = [...d.customers]
        const cats = [...d.cats]
        const orders = [...d.orders]

        rows.forEach((row) => {
          const code = (row.customerCode || '').trim().toLowerCase()
          const phone = (row.phone || '').replace(/\D/g, '')
          const idx = customers.findIndex((c) => {
            if (code && (c.customerCode || '').trim().toLowerCase() === code) return true
            return false
          })

          const target = idx >= 0 ? idx : phone
            ? customers.findIndex((c) => (c.phone || '').replace(/\D/g, '') === phone)
            : -1

          if (target >= 0) {
            const patch = {}
            Object.entries(row).forEach(([k, v]) => {
              if (k in customers[target] && v !== '' && v != null) patch[k] = v
            })
            customers[target] = { ...customers[target], ...patch }
            merged += 1
            return
          }

          const customer = makeCustomer(row)
          customers.unshift(customer)
          created += 1

          if (row.catName) {
            cats.push(
              makeCat({
                customerId: customer.id,
                name: row.catName,
                previousBrand: row.previousBrand || '',
                packetsPerDay: row.packetsPerDay || '',
                eats: row.eats || 'unknown',
              })
            )
          }

          if (row.orderNumber) {
            orders.push(
              makeOrder({
                customerId: customer.id,
                orderNumber: row.orderNumber,
                orderDate: row.orderDate || customer.signupDate,
                deliveryStatus: row.deliveryStatus || 'pending',
                deliveryDate: row.deliveryDate || null,
              })
            )
          }
        })

        return { ...d, customers, cats, orders }
      })

      return { created, merged }
    }

    return {
      addUser,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      recordInfo,
      addCat,
      updateCat,
      deleteCat,
      addOrder,
      updateOrder,
      deleteOrder,
      registerCall,
      advanceCall,
      finalizeCall,
      deleteCall,
      setSubscriptionStatus,
      importCustomers,
      syncCustomers,
    }
  }, [])

  const value = useMemo(() => ({ ...db, ...api }), [db, api])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside a <DataProvider>')
  return ctx
}
