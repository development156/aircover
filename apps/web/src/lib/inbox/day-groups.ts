import { DEFAULT_ZONE } from '@/lib/time/zone'

/**
 * Grouping a thread's messages into calendar days, in the workspace's own zone.
 *
 * ── WHY NOT `Date.toDateString()` ─────────────────────────────────────────────
 * That reads the runtime's LOCAL zone, which on a server is UTC and on a laptop is
 * whatever the laptop is set to — neither is the shop owner's. A message sent at
 * 19:00 UTC is already the next calendar day in `Asia/Kolkata` (UTC+5:30), so a
 * UTC-keyed group would misplace it a day early for every reader in India.
 */

const KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEFAULT_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const LABEL_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: DEFAULT_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** `y-m-d` in the workspace zone, or `null` for a timestamp that cannot be read. */
export function dayKey(value: string | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  // `en-CA` already formats as `YYYY-MM-DD`.
  return KEY_FORMAT.format(parsed)
}

/** "Sat, 8 Aug" — the separator's own words. Caller guarantees a readable timestamp. */
export function dayLabel(value: string): string {
  const parsed = new Date(value)
  // en-GB gives "Sat, 8 Aug"
  return LABEL_FORMAT.format(parsed).replace(/^(\w+)\s/, '$1, ')
}

export interface DayGroup<T> {
  /** `null` when every item in this group had an unreadable timestamp. */
  key: string | null
  /** The separator's text, or `null` alongside a `null` key. */
  label: string | null
  items: T[]
}

/**
 * Group items with a `createdAt` into runs of one calendar day each, in arrival order.
 *
 * A run rather than a full grouping by key: two messages from the same day but
 * separated by a message with no readable timestamp still get two groups, because the
 * separator is a visual break in the SEQUENCE, not a bucket that reorders it.
 */
export function groupByDay<T extends { createdAt?: string }>(items: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []

  for (const item of items) {
    const key = dayKey(item.createdAt)
    const current = groups[groups.length - 1]

    if (current && current.key === key) {
      current.items.push(item)
      continue
    }

    groups.push({
      key,
      label: key === null ? null : dayLabel(item.createdAt as string),
      items: [item],
    })
  }

  return groups
}
