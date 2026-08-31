/**
 * "UP 34% ON YOUR NORMAL" — OR HONESTLY, NOTHING.
 *
 * ── THE FIGURE THIS PRODUCT EXISTS TO GET RIGHT ──────────────────────────────
 * "3,240 reached" is not a sentence anybody can act on. "Up 34% on your normal"
 * is, and it is the reason a customer's tenth week here is worth more than their
 * second: the baseline is theirs and it does not travel.
 *
 * It is also the single easiest number on this screen to fabricate, and the
 * fabrication looks exactly like a measurement.
 *
 * ── THE TRAP, WHICH IS NOT OBVIOUS ───────────────────────────────────────────
 * `post_metric_snapshots.value` is a RUNNING LIFETIME TOTAL since the post went
 * out. Its own migration says so and forbids differencing two days to get "reach
 * on Tuesday", because no platform ever reported that number.
 *
 * The same fact ruins the obvious baseline. Compare this week's posts against
 * last month's and this week's are two days old while last month's have had
 * thirty to accumulate. Every new week would read as a collapse, forever, and
 * every figure in the sentence would have come from a real row.
 *
 * So nothing here compares a total to a total. It compares a post's total AT AN
 * AGE against other posts' totals AT THE SAME AGE — "reach by day seven"
 * against "reach by day seven" — which is the only comparison the stored shape
 * supports.
 *
 * ── AND IT REFUSES FAR MORE OFTEN THAN IT ANSWERS ────────────────────────────
 * That is the correct behaviour and not a limitation to be tuned away. Four
 * floors below, each naming its own reason, because "we have not measured enough
 * of your posts yet" and "your week was ordinary" are different sentences and
 * only one of them is about the customer.
 *
 * Pure: no I/O, no clock, no React.
 */

/**
 * The age, in whole days after publishing, at which posts are compared.
 *
 * Seven because it is the first age at which a weekly report can speak about a
 * whole week of posts, and because platform reporting for a post has settled by
 * then on every channel this product publishes to.
 */
export const COMPARE_AGE_DAYS = 7

/**
 * Prior posts needed before "your normal" is a thing that exists.
 *
 * Three, the same floor `compareGroups` puts on an arm of a comparison, for the
 * same reason: two posts cannot distinguish a customer's normal from one
 * unusual afternoon, and a baseline of one is not a baseline, it is a rival.
 */
export const MIN_BASELINE_POSTS = 3

/**
 * The baseline itself must reach this before a percentage against it means
 * anything.
 *
 * A normal of 3 and a week of 4 is "up 33%", and it is nothing of the kind — it
 * is two very small numbers, either of which moves by one when somebody opens
 * their own post. Same value and same argument as `MIN_LEADER_MEAN`, kept here
 * rather than imported so this module stays a leaf that reaches nothing.
 */
export const MIN_BASELINE_VALUE = 10

/**
 * How far from normal a week must land before it is called up or down.
 *
 * Under a tenth is inside the ordinary week-to-week wobble of platform
 * reporting, and a report that announces a direction every single week teaches
 * its reader that the direction means nothing. Below this the honest answer is
 * "about the same as usual" — which is a real finding, not a refusal.
 */
export const MIN_MOVE = 0.1

/** One post's stored measurements, with the day it went out. */
export interface AgedPost {
  postId: string
  /** `YYYY-MM-DD`, UTC, the day the channel published. */
  publishedOn: string
  /** Every stored reading for this post on this metric: `YYYY-MM-DD` → value. */
  readings: ReadonlyArray<{ measuredOn: string; value: number }>
}

/** Why there is no comparison, each a different sentence to the reader. */
export type NoNormalReason =
  /** Nothing of this customer's has been measured at all. */
  | 'no-history'
  /** Measurements exist, but too few earlier posts reached the comparison age. */
  | 'too-few-prior-posts'
  /** Earlier posts qualify, but nothing in the week being reported has aged in. */
  | 'week-too-young'
  /** A normal exists and is too small for a percentage against it to mean anything. */
  | 'numbers-too-small'

export type Normal =
  | { kind: 'none'; reason: NoNormalReason }
  | {
      kind: 'compared'
      /** `level` is a finding, not an absence — see `MIN_MOVE`. */
      direction: 'up' | 'down' | 'level'
      /** Whole percent away from normal. Always positive; `direction` carries the sign. */
      movePercent: number
      weekValue: number
      normalValue: number
      /** Earlier posts the normal was computed from. The evidence a reader weighs. */
      basedOnPosts: number
      ageDays: number
    }

/** Whole days between two `YYYY-MM-DD` days, or null if either is unreadable. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * A post's total at exactly `age` days old, or null.
 *
 * EXACTLY, not "the nearest reading". A running total read on day five is the
 * total by day five, and calling it the total by day seven understates the post
 * by however much it earned in between. The size of that error is unknown and
 * it is not symmetric, so a tolerance here would bias every comparison in the
 * direction of whichever side happened to be polled less often.
 *
 * The cost is that this returns null on a day the collecting job missed, and the
 * week says "we have not measured enough yet". That is the safe failure.
 */
export function readingAtAge(
  post: AgedPost,
  age: number,
): { measuredOn: string; value: number } | null {
  for (const reading of post.readings) {
    if (daysBetween(post.publishedOn, reading.measuredOn) === age) return reading
  }
  return null
}

export function valueAtAge(post: AgedPost, age: number): number | null {
  return readingAtAge(post, age)?.value ?? null
}

/** The middle value. Median, not mean: one post going viral is not a new normal. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] as number
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/**
 * Compare one week's posts against the customer's own normal.
 *
 * `week` and `earlier` must be posts on the SAME CHANNEL. Mixing them is the
 * other way to fabricate this figure: an Instagram week measured against a
 * baseline holding LinkedIn posts is a comparison between two audiences, and it
 * would move whenever the channel mix moved rather than whenever the work did.
 * Enforced by the caller, which reads one channel at a time.
 */
export function normalFor(
  week: readonly AgedPost[],
  earlier: readonly AgedPost[],
  age: number = COMPARE_AGE_DAYS,
): Normal {
  if (week.length === 0 && earlier.length === 0) return { kind: 'none', reason: 'no-history' }

  const earlierValues = earlier
    .map((post) => valueAtAge(post, age))
    .filter((value): value is number => value !== null)

  // The baseline is checked before the week, deliberately. With too few earlier
  // posts the thing that has to happen first is more weeks of publishing, and
  // telling somebody their week is too young would send them to wait for the
  // wrong thing.
  if (earlierValues.length < MIN_BASELINE_POSTS) {
    return { kind: 'none', reason: 'too-few-prior-posts' }
  }

  const weekValues = week
    .map((post) => valueAtAge(post, age))
    .filter((value): value is number => value !== null)

  if (weekValues.length === 0) return { kind: 'none', reason: 'week-too-young' }

  const normalValue = median(earlierValues)
  const weekValue = median(weekValues)
  if (normalValue === null || weekValue === null) return { kind: 'none', reason: 'no-history' }

  // Before the direction, because 4-against-3 clears any move threshold and is
  // still not a finding. A zero normal lands here too, which is what keeps the
  // division below from producing an infinity.
  if (normalValue < MIN_BASELINE_VALUE) return { kind: 'none', reason: 'numbers-too-small' }

  const move = (weekValue - normalValue) / normalValue
  const direction = Math.abs(move) < MIN_MOVE ? 'level' : move > 0 ? 'up' : 'down'

  return {
    kind: 'compared',
    direction,
    movePercent: Math.round(Math.abs(move) * 100),
    weekValue,
    normalValue,
    basedOnPosts: earlierValues.length,
    ageDays: age,
  }
}
