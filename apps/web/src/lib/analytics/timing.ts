import type { Channel } from '@sahoda/shared'

import { compareGroups, type GroupComparison } from '@/lib/analytics/grouped-lift'
import { readingAtAge, type AgedPost } from '@/lib/analytics/like-age'

/**
 * WHEN THIS BUSINESS SHOULD POST — ONE SELECTOR, TWO SCREENS.
 *
 * ── WHY THIS IS A SELECTOR AND NOT A COMPONENT ───────────────────────────────
 * Analytics draws a grid of days and times. The CMO Report says a sentence about
 * the same thing. If those were two calculations they WOULD disagree, not as a
 * risk but as a certainty: two implementations of "best" drift on the first edge
 * case either author did not think about, and the customer meets the two screens
 * an hour apart. So the grid and the sentence come out of one function here, and
 * the sentence is `bestSlotSentence` in this same file.
 *
 * ── AND WHY IT REFUSES SO OFTEN ──────────────────────────────────────────────
 * `lib/posts/schedule-choices.ts` has said since it was written that there is no
 * best-time backend, and refuses to render a "Best time · 6pm" chip because that
 * would be an invention. This file is that backend, and it is only allowed to
 * exist if it inherits the same discipline: every cell states how many posts it
 * was computed from, a cell below the floor is not shaded at all, and the
 * headline slot has to clear the same gates a Brand Brain learning does.
 *
 * ── THE AGE TRAP, AGAIN ──────────────────────────────────────────────────────
 * Stored values are running lifetime totals, so a slot that happens to hold
 * older posts wins on age alone. Every cell here is built from each post's
 * reading at ONE SHARED AGE, exactly as the weekly comparison is. A heatmap of
 * raw totals is a heatmap of publish dates.
 *
 * Pure: no I/O, no clock, no React.
 */

/** Posts a single slot needs before it is shaded rather than greyed. */
export const MIN_SLOT_POSTS = 3

/**
 * The parts of the day, and why there are four rather than twenty-four.
 *
 * An hourly grid is 168 cells, and a small business publishing four times a week
 * fills about one of them a month. Twenty-eight cells is the coarsest grid that
 * still answers the question somebody actually has, which is "mornings or
 * evenings", not "09:00 or 10:00".
 *
 * The boundaries are the product's own: `lib/posts/schedule-choices.ts` already
 * offers "tomorrow morning" at 9 and "tomorrow evening" at 18, so a reader told
 * that mornings do best and then offered a morning slot gets the same word for
 * the same thing.
 */
export const DAY_PARTS = [
  { id: 'morning', label: 'Morning', fromHour: 5, toHour: 11 },
  { id: 'afternoon', label: 'Afternoon', fromHour: 12, toHour: 16 },
  { id: 'evening', label: 'Evening', fromHour: 17, toHour: 21 },
  { id: 'night', label: 'Night', fromHour: 22, toHour: 4 },
] as const

export type DayPartId = (typeof DAY_PARTS)[number]['id']

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

/** One published channel of one post, with the readings taken for it. */
export interface TimedPost {
  postId: string
  channel: Channel
  /** ISO instant the channel published. */
  publishedAt: string
  aged: AgedPost
}

/** One cell of the grid. */
export interface Slot {
  weekday: Weekday
  part: DayPartId
  /** Posts that landed in this slot AND carried a reading at the shared age. */
  posts: number
  /**
   * Average reach at the shared age, or null.
   *
   * Null below `MIN_SLOT_POSTS`, and null is not a low value: the cell is drawn
   * as having no reading rather than as having a poor one. A slot with one post
   * shaded pale is a recommendation against a time nobody has tested.
   */
  average: number | null
}

export type Timing =
  | { kind: 'none'; reason: 'no-history' | 'no-common-age' }
  | {
      kind: 'ready'
      slots: Slot[]
      /** The age every cell was read at. Stated on the screen, never implied. */
      ageDays: number
      /** Posts behind the whole grid. */
      posts: number
      /** The winning slot, or the gate it failed. */
      best: GroupComparison
    }

/**
 * The wall-clock hour and weekday of an instant, in a named zone.
 *
 * ── WHY THE ZONE IS NOT OPTIONAL ─────────────────────────────────────────────
 * "Tuesday morning" is a claim about the reader's clock, not about UTC. A shop
 * in Bhubaneswar publishing at 20:00 local is publishing at 14:30 UTC, and a
 * grid built in UTC would tell them their evenings are afternoons. `Intl` is
 * used rather than an offset table because offsets move twice a year in half the
 * world and a stored number would be wrong for six months of it.
 *
 * Returns null for an instant or a zone it cannot read, and a null is dropped
 * rather than defaulted. A post placed in the wrong cell is a wrong answer that
 * looks exactly like a right one.
 */
export function localSlotOf(
  iso: string,
  timeZone: string,
): { weekday: Weekday; part: DayPartId } | null {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null

  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(at))
  } catch {
    return null
  }

  const weekday = parts.find((part) => part.type === 'weekday')?.value as Weekday | undefined
  const hourText = parts.find((part) => part.type === 'hour')?.value
  if (!weekday || !WEEKDAYS.includes(weekday) || hourText === undefined) return null

  // `hour12: false` yields 24 for midnight in some engines. Normalised rather
  // than trusted, because a 24 would fall through every band below and silently
  // drop every midnight post.
  const hour = Number(hourText) % 24
  if (!Number.isFinite(hour)) return null

  for (const part of DAY_PARTS) {
    const wraps = part.fromHour > part.toHour
    const inside = wraps
      ? hour >= part.fromHour || hour <= part.toHour
      : hour >= part.fromHour && hour <= part.toHour
    if (inside) return { weekday, part: part.id }
  }
  return null
}

/** The label a reader sees for a slot, and the one both screens must share. */
export function slotLabel(weekday: string, part: DayPartId): string {
  const name = DAY_PARTS.find((entry) => entry.id === part)?.label ?? part
  return `${weekday} ${name.toLowerCase()}`
}

/** Mean, rounded, because a slot average of 412.66666 is not a reading. */
function mean(values: readonly number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * The grid, and the slot that wins it.
 *
 * `age` is supplied by the caller rather than found here, so the heatmap, the
 * weekly comparison and the ranking on the same screen are all read at one age
 * and cannot quietly disagree about which posts they included.
 */
export function timingGrid(posts: readonly TimedPost[], age: number, timeZone: string): Timing {
  if (posts.length === 0) return { kind: 'none', reason: 'no-history' }

  const cells = new Map<string, { weekday: Weekday; part: DayPartId; values: number[] }>()
  const observations: Array<{ postId: string; group: string; value: number; measuredOn: string }> =
    []

  for (const post of posts) {
    const slot = localSlotOf(post.publishedAt, timeZone)
    if (slot === null) continue
    const reading = readingAtAge(post.aged, age)
    if (reading === null) continue

    const key = `${slot.weekday}|${slot.part}`
    const cell = cells.get(key) ?? { weekday: slot.weekday, part: slot.part, values: [] }
    cell.values.push(reading.value)
    cells.set(key, cell)

    observations.push({
      postId: `${post.postId}:${post.channel}`,
      group: slotLabel(slot.weekday, slot.part),
      value: reading.value,
      measuredOn: reading.measuredOn,
    })
  }

  if (observations.length === 0) return { kind: 'none', reason: 'no-common-age' }

  const slots: Slot[] = []
  for (const weekday of WEEKDAYS) {
    for (const part of DAY_PARTS) {
      const cell = cells.get(`${weekday}|${part.id}`)
      const count = cell?.values.length ?? 0
      slots.push({
        weekday,
        part: part.id,
        posts: count,
        // Below the floor there is no average, not a small one. A cell shaded
        // from one post recommends a time nobody has tested.
        average: cell && count >= MIN_SLOT_POSTS ? mean(cell.values) : null,
      })
    }
  }

  return {
    kind: 'ready',
    slots,
    ageDays: age,
    posts: observations.length,
    // The SAME gates a Brand Brain learning clears. A slot that wins by a
    // hair, on small numbers, or against no second slot, is not a finding.
    best: compareGroups(
      observations.map((observation) => ({ ...observation, metric: 'reach' })),
      'reach',
    ),
  }
}

/**
 * THE SENTENCE. Both screens print this exact string.
 *
 * Returns null when there is no defensible winner, and a null must be rendered
 * as nothing rather than as a hedge: "we could not find a best time" invites the
 * reader to believe there is one and we are being coy.
 */
export function bestSlotSentence(timing: Timing): string | null {
  if (timing.kind !== 'ready') return null
  if (timing.best.kind !== 'lift') return null
  const lift = timing.best.lift
  return `${lift.leader} does best for you.`
}

/**
 * How much of the grid's own average a cell is worth, for shading.
 *
 * Relative to the workspace itself and to nothing else: this product compares a
 * business against its own history and never against an industry figure.
 * Returns null for a cell with no reading, so the caller draws "no data" rather
 * than a floor value.
 */
export function shadeOf(slot: Slot, slots: readonly Slot[]): number | null {
  if (slot.average === null) return null
  const measured = slots.filter((entry) => entry.average !== null).map((entry) => entry.average!)
  if (measured.length === 0) return null
  const average = measured.reduce((a, b) => a + b, 0) / measured.length
  if (average <= 0) return null
  return slot.average / average
}
