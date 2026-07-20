/**
 * Demo timestamps are anchored to the run clock, never to fixed calendar dates: a
 * demo seeded in July must still show "published 3 days ago / scheduled Thursday"
 * when it is opened in October. Idempotency therefore means the same ROW SET and the
 * same balance on re-run — not byte-identical timestamps.
 *
 * Times of day are expressed in IST because the workspace is a Cuttack shop: a 9am
 * post means 9am for its customers, not 9am UTC.
 */

/** Asia/Kolkata is a fixed +05:30 offset — India observes no DST, so this is exact. */
const IST_OFFSET_MINUTES = 5 * 60 + 30
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

/** Midnight IST of the day `dayOffset` days from the anchor, as a UTC instant. */
function istMidnight(anchor: Date, dayOffset: number): number {
  const shifted = anchor.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE
  const istDayStart = Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY
  return istDayStart + dayOffset * MS_PER_DAY - IST_OFFSET_MINUTES * MS_PER_MINUTE
}

/**
 * An instant `dayOffset` days from `anchor` at local IST `hh:mm`.
 * `at(now, -3, '09:00')` = 9am IST three days ago.
 */
export function at(anchor: Date, dayOffset: number, hhmm: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) throw new Error(`expected HH:MM, got ${JSON.stringify(hhmm)}`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new Error(`not a valid time of day: ${hhmm}`)
  return new Date(istMidnight(anchor, dayOffset) + (hours * 60 + minutes) * MS_PER_MINUTE)
}

/** `anchor` shifted by whole minutes — for "the publish log fired 40s after the post". */
export function minutesFrom(anchor: Date, minutes: number): Date {
  return new Date(anchor.getTime() + minutes * MS_PER_MINUTE)
}

/** Billing period key for the monthly grant idempotency key, e.g. "2026-07". */
export function periodKey(anchor: Date): string {
  const ist = new Date(anchor.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
}

/** First instant of the anchor's IST month, as a UTC instant (subscription period start). */
export function monthStart(anchor: Date): Date {
  const ist = new Date(anchor.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  const utcMonthStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1)
  return new Date(utcMonthStart - IST_OFFSET_MINUTES * MS_PER_MINUTE)
}

/** First instant of the following IST month (subscription period end). */
export function nextMonthStart(anchor: Date): Date {
  const ist = new Date(anchor.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  const utcNextMonth = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1)
  return new Date(utcNextMonth - IST_OFFSET_MINUTES * MS_PER_MINUTE)
}
