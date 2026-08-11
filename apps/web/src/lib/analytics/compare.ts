import type { MetricAvailability, PostMetrics } from '@sahoda/publishing'
import type { Channel } from '@sahoda/shared'

/**
 * Comparing posts and channels, without letting an absent number become a zero.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────
 * `classifyPostMetrics` already decides what a SINGLE metric may claim, and
 * `metricValue()` already renders an unreported one as an em dash. Both work on one
 * number at a time. Comparison is the first surface that puts many numbers in a
 * relationship with each other, and a relationship leaks a zero through doors that
 * are not numbers at all:
 *
 *   · ORDER. Rank five posts by impressions and a `pending` post has no value to
 *     sort by. Give it 0 and it lands at the bottom of the list, in the position
 *     that means "this post reached the fewest people" — a claim the dash on its
 *     own card was careful never to make. The list has said it for the card.
 *
 *   · SUM. "1,240 impressions across your posts" reads as a total. If two of the
 *     seven posts were pending and were quietly skipped, it is a subtotal wearing a
 *     total's clothes, and it is wrong in the direction that flatters us.
 *
 *   · SHARE. "Instagram drove 80% of your reach" is arithmetic on a denominator.
 *     A denominator built from partial coverage produces a percentage that is not
 *     about anything.
 *
 * So nothing here returns a bare number. Every figure arrives with the `Coverage`
 * it was computed from, and a figure with no coverage at all is `null` rather than
 * 0 — the same refusal `PostMetrics` makes, one level up.
 *
 * Pure: no I/O, no clock, no React.
 */

/** The three figures a post can be compared on. */
export type MetricKey = 'impressions' | 'reach' | 'engagement'

export const METRIC_LABELS: Readonly<Record<MetricKey, string>> = {
  impressions: 'Impressions',
  reach: 'Reach',
  engagement: 'Engagement',
}

/** One channel of one post, with whatever verdict it earned. */
export interface ComparableRow {
  postId: string
  /** For display. The comparison never reads it. */
  title: string
  channel: Channel
  state: MetricAvailability
}

/** A row that carries a real number for the metric in question. */
export interface MeasuredRow {
  postId: string
  title: string
  channel: Channel
  value: number
  /** Zernio's sync stamp. A poll time, not a measurement time — see `PostMetrics`. */
  measuredAt: string
}

/**
 * How much of the population a figure was computed from.
 *
 * Always carried, never optional. An optional coverage is one a caller can forget
 * to render, and a total rendered without its coverage is the exact failure this
 * module was written to prevent.
 */
export interface Coverage {
  /** Rows that carried a real number for this metric. */
  counted: number
  /** Rows that were in scope at all, measured or not. */
  of: number
}

/** A figure, and the coverage behind it. Never one without the other. */
export interface CoveredTotal {
  value: number
  coverage: Coverage
}

/**
 * Is this row's metric a real number?
 *
 * TWO conditions, and the second is the one that is easy to miss: a state can be
 * `ready` and still hold `impressions: null`, because `ready` means "the payload was
 * a measurement", not "every field arrived". Treating every `ready` row as countable
 * would put an absent impressions count into a total as a zero — through the one
 * state that is allowed to hold numbers.
 */
function valueOf(state: MetricAvailability, metric: MetricKey): number | null {
  if (state.kind !== 'ready') return null
  const value: PostMetrics[MetricKey] = state.metrics[metric]
  return value
}

/** Every row that can honestly contribute a number to this metric. */
export function measuredFor(rows: readonly ComparableRow[], metric: MetricKey): MeasuredRow[] {
  return rows.flatMap((row) => {
    const value = valueOf(row.state, metric)
    if (value === null || row.state.kind !== 'ready') return []
    return [
      {
        postId: row.postId,
        title: row.title,
        channel: row.channel,
        value,
        measuredAt: row.state.metrics.measuredAt,
      },
    ]
  })
}

/**
 * The rows this metric cannot speak for.
 *
 * Returned rather than discarded, because "3 of 8 channels reported" is only half a
 * sentence — the reader's next question is which five, and why. Every one of them
 * still carries its own `MetricAvailability`, so the answer is already in hand.
 */
export function unmeasuredFor(rows: readonly ComparableRow[], metric: MetricKey): ComparableRow[] {
  return rows.filter((row) => valueOf(row.state, metric) === null)
}

export function coverageFor(rows: readonly ComparableRow[], metric: MetricKey): Coverage {
  return { counted: measuredFor(rows, metric).length, of: rows.length }
}

/**
 * The sum, or nothing.
 *
 * `null` when no row reported, and deliberately not `{ value: 0, coverage: {0, n} }`.
 * A zero with a stated coverage of zero is technically honest and still renders as a
 * big "0" that a reader takes at face value; there is no total, so there is no
 * figure to print.
 *
 * A genuine sum of reported zeroes DOES return 0 — `counted` is what separates
 * them, which is the whole reason it travels with the value.
 */
export function totalFor(rows: readonly ComparableRow[], metric: MetricKey): CoveredTotal | null {
  const measured = measuredFor(rows, metric)
  if (measured.length === 0) return null
  return {
    value: measured.reduce((sum, row) => sum + row.value, 0),
    coverage: { counted: measured.length, of: rows.length },
  }
}

/**
 * Best first — and only among rows that have a number.
 *
 * Unmeasured rows are not ranked last; they are not ranked. Callers render them in
 * their own group, where "not available yet" is the whole entry and no position is
 * implied. Ties break on title so the order is stable between renders rather than
 * dependent on the order Zernio answered in.
 */
export function rankBy(
  rows: readonly ComparableRow[],
  metric: MetricKey,
  limit?: number,
): MeasuredRow[] {
  const ranked = [...measuredFor(rows, metric)].sort(
    (a, b) => b.value - a.value || a.title.localeCompare(b.title),
  )
  return limit === undefined ? ranked : ranked.slice(0, limit)
}

export interface ChannelRollup {
  channel: Channel
  /** Null when this channel reported nothing for this metric. Never 0. */
  total: CoveredTotal | null
  /** Rows on this channel, in scope, measured or not. */
  rows: ComparableRow[]
}

/**
 * Per-channel totals, for "which channel is working".
 *
 * Each channel's coverage is its OWN — a channel where one post of four reported is
 * not comparable to one where four of four did, and a table that shows both as bare
 * numbers invites exactly that comparison. Channels are returned in the order they
 * first appear, so the caller decides the sort rather than inheriting one.
 */
export function byChannel(rows: readonly ComparableRow[], metric: MetricKey): ChannelRollup[] {
  const grouped = new Map<Channel, ComparableRow[]>()
  for (const row of rows) {
    const existing = grouped.get(row.channel)
    if (existing) existing.push(row)
    else grouped.set(row.channel, [row])
  }
  return [...grouped].map(([channel, channelRows]) => ({
    channel,
    total: totalFor(channelRows, metric),
    rows: channelRows,
  }))
}

/**
 * A channel's share of the measured whole, when that share means anything.
 *
 * Null unless BOTH the part and the whole are fully covered. A percentage computed
 * across partial coverage is not a smaller truth, it is a different quantity: with
 * two of five Instagram posts reporting, "Instagram is 30% of your reach" describes
 * a population that does not exist. There is no honest way to render it, so there
 * is no number to render.
 */
export function shareOfMeasured(
  rows: readonly ComparableRow[],
  channel: Channel,
  metric: MetricKey,
): number | null {
  const whole = totalFor(rows, metric)
  if (whole === null || whole.value === 0) return null
  if (whole.coverage.counted !== whole.coverage.of) return null

  const part = totalFor(
    rows.filter((row) => row.channel === channel),
    metric,
  )
  if (part === null || part.coverage.counted !== part.coverage.of) return null

  return part.value / whole.value
}

/** "3 of 8 channels reported" — the sentence a figure may never appear without. */
export function coverageNote(coverage: Coverage, noun = 'channels'): string {
  if (coverage.counted === coverage.of) {
    return `All ${coverage.of} ${noun} reported.`
  }
  return `${coverage.counted} of ${coverage.of} ${noun} reported — the rest aren’t available yet.`
}
