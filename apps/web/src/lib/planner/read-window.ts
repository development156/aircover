import { firstGridDay, MONTH_GRID_DAYS } from '@/lib/planner/month'
import { mondayOf } from '@/lib/planner/week-window'
import { addDaysInZone } from '@/lib/time/day-key'

/**
 * THE INSTANTS THE CALENDAR QUERY ASKS FOR.
 *
 * ── COMPUTED IN UTC, ON PURPOSE ──────────────────────────────────────────────
 * The workspace's zone arrives with the workspace read. Waiting for it before
 * asking for the posts would put a round trip in front of every planner render
 * (`read-waterfall.test.ts` ratchets exactly that). So the bounds are read on
 * the UTC calendar and padded, which covers every zone the runtime knows
 * (UTC-12 to UTC+14): the over-fetch is filtered by the drawn day keys
 * downstream, and the under-fetch — a post on the drawn Sunday evening in
 * Auckland, missing — is what `read-window.test.ts` makes impossible.
 *
 * ── "NOW" IS THREE DATES, NOT ONE ────────────────────────────────────────────
 * A day of padding is not enough on its own. At 12:00Z on a Sunday it is
 * already Monday in Auckland, so Auckland's "this week" is a WHOLE WEEK later
 * than UTC's, and its "this month" can be the next month. The window is
 * therefore built from every calendar date `now` can be somewhere on Earth —
 * the UTC date and its two neighbours — and the union of the weeks and grids
 * those anchor. Then a day each side for the hours.
 *
 * ── THE UNION OF THE WEEK AND THE MONTH ──────────────────────────────────────
 * The timeline draws a week and the mini calendar beside it draws a month, and
 * `?week=10` beside `?month=` unset is a legal URL. Both must be fed.
 */
const PAD_DAYS = 1
const UTC = 'UTC'

export function readWindowBounds({
  now,
  weekOffset,
  monthKey,
}: {
  now: Date
  weekOffset: number
  /** `?month=YYYY-MM`, or null for the month holding `now`. */
  monthKey: string | null
}): { fromIso: string; toIso: string } {
  const starts: number[] = []
  const ends: number[] = []

  for (const shift of [-1, 0, 1]) {
    const today = addDaysInZone(UTC, now, shift)

    const weekStart = mondayOf(UTC, addDaysInZone(UTC, today, weekOffset * 7))
    starts.push(weekStart.getTime())
    ends.push(addDaysInZone(UTC, weekStart, 7).getTime())

    // A named month is the same month in every zone; only "this month" moves.
    const monthAnchor = monthKey === null ? today : new Date(`${monthKey}-01T12:00:00Z`)
    const gridStart = firstGridDay(UTC, monthAnchor)
    starts.push(gridStart.getTime())
    ends.push(addDaysInZone(UTC, gridStart, MONTH_GRID_DAYS).getTime())
  }

  const start = new Date(Math.min(...starts))
  const end = new Date(Math.max(...ends))

  return {
    fromIso: addDaysInZone(UTC, start, -PAD_DAYS).toISOString(),
    toIso: addDaysInZone(UTC, end, PAD_DAYS).toISOString(),
  }
}
