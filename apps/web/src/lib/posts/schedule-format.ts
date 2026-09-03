import { DEFAULT_DISPLAY_ZONE, resolveDisplayZone, zoneLabel } from '@/lib/time/zone'

/**
 * `scheduled_at` is stored as a timestamptz. Rendering it means choosing a
 * clock, and this module makes that choice once, out loud.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * Both formatters were pinned to a hardcoded `Asia/Kolkata` while the PICKER
 * built its instant on the reader's own browser clock. MEASURED: a customer in
 * Dubai picks "tomorrow morning", the composer confirms 9:00 am, and the posts
 * list calls the same post 10:30 am IST. Neither number is wrong; the product
 * simply told them two different times for one post.
 *
 * `formatScheduledAt` at least appended `IST`, so a reader had something to go
 * on. `formatScheduledTime` did not — the week grid and the timeline rendered a
 * bare `10:30 am`, two unlabelled clock times an hour and a half apart in the
 * same session. A time with no zone beside it is a number the reader cannot
 * check, which is the whole defect in one line.
 *
 * ── WHAT IS TRUE NOW ─────────────────────────────────────────────────────────
 * The zone comes from the workspace when it has one, so the setting a customer
 * chose finally reaches a screen, and EVERY time carries its label. What is
 * still not true is that the picker builds in this zone: it uses the reader's
 * own clock. That gap is now visible rather than silent — the composer says
 * which clock it used, these say which clock they are in — and closing it means
 * moving the month grid, the day buckets and the now-line together, which is its
 * own change.
 */

/** One formatter per zone. `Intl.DateTimeFormat` is costly to build and these repeat per row. */
const DATE_TIME_CACHE = new Map<string, Intl.DateTimeFormat>()
const TIME_CACHE = new Map<string, Intl.DateTimeFormat>()

function cached(
  cache: Map<string, Intl.DateTimeFormat>,
  zone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let f = cache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-IN', { ...options, timeZone: zone })
    cache.set(zone, f)
  }
  return f
}

/**
 * "02 Sept 2026, 09:00 am IST" — the posts list, the planner rows, analytics.
 *
 * `zone` is the workspace's stored timezone. Absent or unusable, it falls back
 * to the zone those workspaces already see, so nobody's times move.
 */
export function formatScheduledAt(value: string | null, zone?: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  // An unparseable timestamp renders nothing rather than "Invalid Date".
  if (Number.isNaN(parsed.getTime())) return null
  const { zone: display } = resolveDisplayZone(zone ?? DEFAULT_DISPLAY_ZONE)
  const formatted = cached(DATE_TIME_CACHE, display, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)
  return `${formatted} ${zoneLabel(display, parsed)}`
}

/**
 * "09:00 am IST" — time of day only, for surfaces whose columns already carry
 * the date.
 *
 * The label is NOT optional here, and that is the point: this function returned
 * a bare clock time for as long as it existed, rendered beside a composer
 * confirmation in a different zone. Anything too narrow for the label should
 * make room rather than drop it.
 */
/**
 * The clock alone, for a surface that states its zone ONCE for everything on it.
 *
 * ── WHY THIS EXISTS RATHER THAN A FLAG ON `formatScheduledTime` ──────────────
 * The header above is right: a bare clock time beside a confirmation in another
 * zone is how somebody schedules a post for the wrong hour, so the suffix is
 * MANDATORY there and must stay hard to drop. The planner's week grid is the one
 * surface where it is genuinely redundant — every card in it is placed by
 * `PLANNER_GRID_ZONE`, so the zone is a property of the grid rather than of each
 * card, and repeating it eleven times cost the thing beside it: in a
 * `(760-56)/7 ≈ 100px` column, "09:00 am IST · Scheduled" truncates to the time
 * and the certainty word disappears.
 *
 * A separate, named function so the choice is visible at every call site. Use it
 * only where the zone is stated for the whole surface.
 */
export function formatScheduledClock(value: string | null, zone?: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const { zone: display } = resolveDisplayZone(zone ?? DEFAULT_DISPLAY_ZONE)
  return cached(TIME_CACHE, display, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)
}

export function formatScheduledTime(value: string | null, zone?: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const { zone: display } = resolveDisplayZone(zone ?? DEFAULT_DISPLAY_ZONE)
  const formatted = cached(TIME_CACHE, display, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)
  return `${formatted} ${zoneLabel(display, parsed)}`
}
