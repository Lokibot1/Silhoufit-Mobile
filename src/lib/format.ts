/** Philippine pesos with a thousands separator, always two decimals: 1,250.00. Hand-rolled, Hermes' Intl support varies by device. */
export function peso(amount: number): string {
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.')
  return `${amount < 0 ? '-' : ''}₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Store time like the web app: Philippine time (UTC+8, no daylight saving), read back through the UTC getters. Null for an unusable value.
function manila(value: string | null | undefined): Date | null {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? null : new Date(time + 8 * 3_600_000)
}
const day = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`

/** An ISO time as a Manila date: "Nov 14, 2026". A dash when missing or invalid. */
export function dateOnly(value: string | null | undefined): string {
  const d = manila(value)
  return d ? day(d) : '—'
}

/** An ISO time as Manila date and 12-hour time: "Nov 14, 2026, 1:49 PM". A dash when missing or invalid. */
export function dateTime(value: string | null | undefined): string {
  const d = manila(value)
  if (!d) return '—'
  const hour = d.getUTCHours()
  return `${day(d)}, ${hour % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

/** Zero-padded loader counter: 7 -> "007%". */
export function percentLabel(percent: number): string {
  return `${String(Math.round(percent)).padStart(3, '0')}%`
}
