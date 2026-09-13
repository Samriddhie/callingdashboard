export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtRelative(iso) {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Never'
  const diff = then - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const past = diff < 0

  let value
  if (mins < 1) return 'just now'
  if (mins < 60) value = `${mins} min`
  else if (mins < 60 * 24) value = `${Math.round(mins / 60)} hr`
  else {
    const days = Math.round(mins / (60 * 24))
    value = `${days} day${days === 1 ? '' : 's'}`
  }

  return past ? `${value} ago` : `in ${value}`
}

/** mm:ss — call durations are short enough that hours would be noise. */
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const mins = Math.floor(s / 60)
  const rest = s % 60
  return `${String(mins).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function isOverdue(iso) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t < Date.now()
}

export function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// datetime-local inputs want local "YYYY-MM-DDTHH:mm", not a UTC ISO string.
export function toInputValue(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

export function toDateInputValue(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromInputValue(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Phone numbers stay hidden until a call is actually initiated. */
export function maskPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return 'No number on file'
  return `••• ••• ${digits.slice(-4)}`
}
