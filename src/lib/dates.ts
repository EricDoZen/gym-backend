const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function formatDisplayDate(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = MONTHS[date.getMonth()] ?? 'Jan'
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

export function formatDisplayTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function parseFlexibleDate(value: string) {
  if (!value) return new Date()
  const iso = Date.parse(value)
  if (!Number.isNaN(iso)) return new Date(iso)
  const parsed = Date.parse(value.replace(/(\d{2}) (\w{3}) (\d{4})/, '$2 $1, $3'))
  if (!Number.isNaN(parsed)) return new Date(parsed)
  return new Date()
}

export function toSqlDate(value: Date) {
  return value
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function addYears(date: Date, years: number) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}
