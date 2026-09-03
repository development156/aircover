import type { DisplayPost } from '@/lib/posts/display-post'

/**
 * A MONDAY-ANCHORED WEEK, so the planner can be navigated.
 *
 * `bucketWeek` starts at TODAY and runs seven days forward, which is right for
 * Home's strip ("what is coming") and wrong for a calendar: a week you can step
 * back and forward through has to have fixed edges, or "previous week" moves by
 * a different amount depending on the day you ask.
 *
 * Everything here is IST, the zone every schedule in this product is stored and
 * rendered in, and the zone the planner header already names out loud.
 */

/**
 * THE ZONE THE WEEK GRID IS BUILT IN, exported because the label must match it.
 *
 * `istDayKey`, `istMinutes` and `hourRange` all place a card with this, so the
 * column a card lands in and the row it sits on are IST facts. When the chip's
 * LABEL was moved to the workspace zone and the placement was not, the two
 * disagreed: a America/New_York workspace with a post at 2026-09-02T20:00-04:00
 * got a card drawn in the Sept 3 column at the 5 am row, captioned "08:00 pm
 * EDT". Every part of that is a real number and the card is nonsense.
 *
 * Exported so the caption asks the grid what zone it is in rather than assuming.
 * Moving the planner to the workspace zone means changing THIS, and the caption
 * follows for free.
 */
export const PLANNER_GRID_ZONE = 'Asia/Kolkata'

const IST = PLANNER_GRID_ZONE
const DAY_MS = 86_400_000

/** `en-GB` is Monday-first, which is what the grid is. Same source as `month.ts`. */
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'short' })
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const HOUR_MIN = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function istWeekdayOffset(at: Date): number {
  const index = MONDAY_FIRST.indexOf(WEEKDAY.format(at))
  // An unrecognised weekday would silently shift the whole grid, so fail to 0
  // rather than to a wrong offset. Same guard as `month.ts`.
  return index < 0 ? 0 : index
}

/** The IST date key (YYYY-MM-DD), matching `bucketWeek`'s own keys. */
export function istDayKey(at: Date): string {
  return DAY_KEY.format(at)
}

/** Minutes past IST midnight, or null when the stamp is absent or unparseable. */
export function istMinutes(iso: string | null): number | null {
  if (iso === null) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const [h, m] = HOUR_MIN.format(at).split(':')
  const hours = Number(h)
  const mins = Number(m)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  return hours * 60 + mins
}

/** The Monday on or before `at`, in IST, at the same wall clock. */
export function mondayOf(at: Date): Date {
  return new Date(at.getTime() - istWeekdayOffset(at) * DAY_MS)
}

export interface WeekWindow {
  /** Seven instants, one inside each IST day, Monday first. */
  days: Date[]
  /** `offset` weeks from the week containing `now`. 0 is this week. */
  offset: number
}

/** The week `offset` weeks from the one containing `now`. */
export function weekWindow(now: Date, offset: number): WeekWindow {
  const monday = mondayOf(new Date(now.getTime() + offset * 7 * DAY_MS))
  return {
    days: Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY_MS)),
    offset,
  }
}

/**
 * The hours the grid draws.
 *
 * ── DERIVED FROM THE WEEK, NOT FIXED AT 8–18 ─────────────────────────────────
 * A fixed window silently HIDES a post scheduled outside it. That is a post the
 * reader planned, absent from the surface whose whole job is showing what is
 * planned, with nothing on screen saying so — the failure mode this codebase
 * calls a measurement that cannot catch a missing thing.
 *
 * So the range covers every scheduled post in the week, padded by an hour each
 * side for air, and falls back to a working day when the week is empty.
 */
export const DEFAULT_FROM_HOUR = 8
export const DEFAULT_TO_HOUR = 19

export function hourRange(posts: readonly DisplayPost[]): { from: number; to: number } {
  const minutes = posts
    .map((post) => istMinutes(post.scheduled_at))
    .filter((m): m is number => m !== null)

  if (minutes.length === 0) return { from: DEFAULT_FROM_HOUR, to: DEFAULT_TO_HOUR }

  const earliest = Math.floor(Math.min(...minutes) / 60)
  const latest = Math.floor(Math.max(...minutes) / 60)

  return {
    from: Math.max(0, Math.min(earliest - 1, DEFAULT_FROM_HOUR)),
    to: Math.min(23, Math.max(latest + 1, DEFAULT_TO_HOUR)),
  }
}

/**
 * Lay overlapping posts side by side within one day.
 *
 * Posts carry a time, not a DURATION, so "overlap" is a rendering question:
 * two cards drawn at the same y would sit on top of each other. `slotMinutes`
 * is the card's visual height expressed in minutes, and anything closer than
 * that shares the column.
 */
export interface Placed {
  post: DisplayPost
  minutes: number
  /** 0-based column within its overlap group. */
  lane: number
  /** How many columns that group needs. */
  lanes: number
}

export function placeDay(posts: readonly DisplayPost[], slotMinutes: number): Placed[] {
  const timed = posts
    .map((post) => ({ post, minutes: istMinutes(post.scheduled_at) }))
    .filter((p): p is { post: DisplayPost; minutes: number } => p.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes)

  const out: Placed[] = []
  let group: typeof timed = []

  const flush = (): void => {
    group.forEach((entry, i) => {
      out.push({ ...entry, lane: i, lanes: group.length })
    })
    group = []
  }

  for (const entry of timed) {
    // A new group starts as soon as this post clears the FIRST post in the
    // current one: cards are a fixed height, so the group's extent is its
    // earliest member plus one slot, not its latest.
    if (group.length > 0 && entry.minutes - group[0]!.minutes >= slotMinutes) flush()
    group.push(entry)
  }
  flush()

  return out
}
