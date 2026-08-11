import type { Channel } from '@sahoda/shared'

import { earliestScheduleAt } from '@/lib/posts/schedule'

/**
 * A "plan my week" slot may not schedule beyond this many days out — the model
 * suggesting next quarter would make "your week is planned" a lie.
 */
export const SLOT_HORIZON_DAYS = 14

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export interface NormalizedSlot {
  /** ISO-8601, always a valid future instant that clears every channel lead. */
  scheduledAt: string
  /** True when the model's suggestion was unusable and a fallback was minted. */
  clamped: boolean
}

/** Round up to the next full hour (already-round instants move a full hour on). */
function nextFullHour(at: number): number {
  return (Math.floor(at / HOUR_MS) + 1) * HOUR_MS
}

/**
 * Make a model-suggested slot TRUE. Keeps a parseable slot that is inside
 * [channel lead .. horizon]; anything else — past, garbage, too soon, next
 * quarter — becomes a deterministic fallback: tomorrow + `index` days at the
 * next full hour, never earlier than the channel lead. `index` staggers the
 * five briefs across five days so a fully-degraded plan still spans a week.
 */
export function normalizeSlot(
  rawSlot: string,
  channels: readonly Channel[],
  now: Date,
  index: number,
): NormalizedSlot {
  const earliest = earliestScheduleAt(channels, now).getTime()
  const horizon = now.getTime() + SLOT_HORIZON_DAYS * DAY_MS

  const suggested = new Date(rawSlot).getTime()
  if (!Number.isNaN(suggested) && suggested >= earliest && suggested <= horizon) {
    return { scheduledAt: new Date(suggested).toISOString(), clamped: false }
  }

  const staggered = nextFullHour(now.getTime() + (index + 1) * DAY_MS)
  const fallback = Math.max(staggered, nextFullHour(earliest))
  return { scheduledAt: new Date(fallback).toISOString(), clamped: true }
}
