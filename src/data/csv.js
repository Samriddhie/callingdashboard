import { daysToFirstOrder, firstOrder, firstOrderDate } from './metrics.js'

// One row per customer. Because a customer can have many cats and many orders,
// the export flattens their *first* cat and *first* order — enough for a working
// call list, and the same columns are accepted back on import.
export const CSV_COLUMNS = [
  'customerCode',
  'name',
  'phone',
  'signupDate',
  'status',
  'productPreference',
  'subscriptionInterest',
  'subscriptionStatus',
  'budget',
  'notes',
  'catName',
  'previousBrand',
  'packetsPerDay',
  'eats',
  'orderNumber',
  'orderDate',
  'deliveryStatus',
  'deliveryDate',
  'firstOrderDate',
  'daysToFirstOrder',
  'callCount',
  'lastCalledAt',
]

// Derived columns are exported for reporting but ignored on import.
const READ_ONLY = new Set(['firstOrderDate', 'daysToFirstOrder', 'callCount'])

function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function customersToCsv({ customers, cats, orders, calls }) {
  const callCount = calls.reduce((acc, c) => {
    if (c.status !== 'didntCall') acc[c.customerId] = (acc[c.customerId] || 0) + 1
    return acc
  }, {})

  const lines = [CSV_COLUMNS.join(',')]

  customers.forEach((c) => {
    const ownCats = cats.filter((x) => x.customerId === c.id)
    const ownOrders = orders.filter((o) => o.customerId === c.id)
    const cat = ownCats[0]
    const order = firstOrder(ownOrders)

    const row = CSV_COLUMNS.map((col) => {
      switch (col) {
        case 'callCount':
          return callCount[c.id] || 0
        case 'firstOrderDate':
          return firstOrderDate(ownOrders) ?? ''
        case 'daysToFirstOrder': {
          const d = daysToFirstOrder(c, ownOrders)
          return d === null ? '' : d
        }
        case 'subscriptionInterest':
          return c.subscriptionInterest ? 'yes' : 'no'
        case 'catName':
          return cat?.name ?? ''
        case 'previousBrand':
          return cat?.previousBrand ?? ''
        case 'packetsPerDay':
          return cat?.packetsPerDay ?? ''
        case 'eats':
          return cat?.eats ?? ''
        case 'orderNumber':
          return order?.orderNumber ?? ''
        case 'orderDate':
          return order?.orderDate ?? ''
        case 'deliveryStatus':
          return order?.deliveryStatus ?? ''
        case 'deliveryDate':
          return order?.deliveryDate ?? ''
        default:
          return c[col] ?? ''
      }
    })

    lines.push(row.map(escapeCell).join(','))
  })

  return lines.join('\n')
}

export function downloadCsv(filename, contents) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Character-by-character, so quoted fields containing commas, newlines and
// escaped quotes ("") all survive a round trip through Excel or Sheets.
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i]

    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else inQuotes = false
      } else cell += char
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }

  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

const TRUTHY = new Set(['yes', 'true', '1', 'y'])

export function csvToCustomers(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []

  // Tolerate friendlier spellings: "Customer Code", "customer_code", "CatName".
  const normalized = rows[0].map((h) => {
    const squashed = h.replace(/[\s_]+/g, '').toLowerCase()
    const hit = CSV_COLUMNS.find((c) => c.toLowerCase() === squashed)
    return hit && !READ_ONLY.has(hit) ? hit : null
  })

  return rows.slice(1).map((cells) => {
    const record = {}
    normalized.forEach((key, i) => {
      if (!key) return
      const value = (cells[i] ?? '').trim()
      if (key === 'subscriptionInterest') record[key] = TRUTHY.has(value.toLowerCase())
      else if (value !== '') record[key] = value
    })
    return record
  })
}
