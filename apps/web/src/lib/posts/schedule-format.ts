/**
 * `scheduled_at` is stored as a timestamptz string. We render it in IST and SAY
 * so — formatting a stored instant in an unlabelled zone is how a schedule time
 * silently becomes a wrong number. Shared by the posts list and the planner.
 */
const SCHEDULE_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

export function formatScheduledAt(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  // An unparseable timestamp renders nothing rather than "Invalid Date".
  if (Number.isNaN(parsed.getTime())) return null
  return `${SCHEDULE_FORMAT.format(parsed)} IST`
}

/** Time-of-day only (IST) — the week grid's columns already carry the date. */
const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

export function formatScheduledTime(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return TIME_FORMAT.format(parsed)
}
