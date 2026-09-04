import type { Channel } from '@sahoda/shared'

import { median, MIN_BASELINE_POSTS } from '@/lib/analytics/like-age'
import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * THE TABLE'S OWN RULES — ordering, paging, and "vs your normal".
 *
 * ── WHY THIS IS NOT IN THE COMPONENT ─────────────────────────────────────────
 * Two of the three are places a number can go wrong quietly. An ordering that
 * treats an unmeasured post as a zero calls it the worst post of the month
 * without ever drawing a zero, which is the failure `compare.ts` was written to
 * stop and is just as reachable from a table header. And "vs your normal" is a
 * ratio, which is the most dangerous shape a figure can take on a small sample.
 *
 * So both live here, where a test can hold them without rendering a route.
 *
 * Pure: no I/O, no clock, no React.
 */

/** Rows per page. The brief's number, and it is also about one screen. */
export const PAGE_SIZE = 25

/**
 * The three stored metrics, and the field each one lives in.
 *
 * A map rather than a `switch`: every one of them is a count read at the SAME
 * age with the SAME meaning for null, so the ordering rule below must treat them
 * identically. A per-metric branch is how one of them quietly stops holding an
 * unmeasured post out of the comparison.
 */
export const METRIC_FIELD = {
  reach: 'reachAtAge',
  impressions: 'impressionsAtAge',
  engagement: 'engagementAtAge',
} as const satisfies Record<string, keyof PublishedRow>

export type MetricSortKey = keyof typeof METRIC_FIELD

export type SortKey = MetricSortKey | 'published' | 'title' | 'channel'
export type SortDirection = 'asc' | 'desc'

export const DEFAULT_SORT: SortKey = 'reach'
export const DEFAULT_DIRECTION: SortDirection = 'desc'

export function isMetricSortKey(value: unknown): value is MetricSortKey {
  return typeof value === 'string' && Object.hasOwn(METRIC_FIELD, value)
}

export function isSortKey(value: unknown): value is SortKey {
  return isMetricSortKey(value) || value === 'published' || value === 'title' || value === 'channel'
}

/** How one post did against the middle of this workspace's own posts. */
export type VersusNormal =
  | { kind: 'compared'; direction: 'up' | 'down' | 'level'; percent: number }
  /** This post has no reading at the shared age. */
  | { kind: 'unmeasured' }
  /** There are too few measured posts for a middle to exist. */
  | { kind: 'no-normal' }

/** Below this a move is inside ordinary noise and is called level. */
export const MIN_MOVE = 0.1

/**
 * The workspace's own middle, or null.
 *
 * MEDIAN and not mean, for the reason the baseline uses one: a single post that
 * went unusually far would drag a mean upward and quietly re-label every other
 * post that week as below normal.
 */
export function normalOf(rows: readonly PublishedRow[]): number | null {
  const values = rows
    .map((row) => row.reachAtAge)
    .filter((value): value is number => value !== null)
  if (values.length < MIN_BASELINE_POSTS) return null
  return median(values)
}

export function versusNormal(row: PublishedRow, normal: number | null): VersusNormal {
  if (normal === null) return { kind: 'no-normal' }
  if (row.reachAtAge === null) return { kind: 'unmeasured' }
  // A zero middle makes every ratio infinite, and there is no percentage to
  // state against nothing.
  if (normal <= 0) return { kind: 'no-normal' }

  const move = (row.reachAtAge - normal) / normal
  return {
    kind: 'compared',
    direction: Math.abs(move) < MIN_MOVE ? 'level' : move > 0 ? 'up' : 'down',
    percent: Math.round(Math.abs(move) * 100),
  }
}

/** The words, so the table and any other surface phrase it identically. */
export function versusSentence(versus: VersusNormal): string {
  switch (versus.kind) {
    case 'no-normal':
      return 'No normal yet'
    case 'unmeasured':
      return 'Not measured yet'
    case 'compared':
      if (versus.direction === 'level') return 'About your normal'
      return `${versus.percent}% ${versus.direction === 'up' ? 'above' : 'below'} your normal`
  }
}

/**
 * Order the rows.
 *
 * ── AN UNMEASURED POST IS NEVER SORTED AS A LOW ONE ──────────────────────────
 * Sorting by reach with a null treated as 0 puts every post the platform has
 * not reported on at the bottom of the list, in the position that reads "this
 * one did worst". The post's own cell is careful to show a dash rather than a
 * zero, and the ordering would have made the claim on its behalf.
 *
 * So unmeasured rows are held out of the comparison entirely and appended after
 * the measured ones, in BOTH directions. Ascending does not promote them to the
 * top either: "we have not measured this" is not a small number.
 *
 * ── AND IT APPLIES TO ALL THREE METRICS, THROUGH ONE PATH ────────────────────
 * Impressions and engagement joined reach when the window read stopped asking
 * for `metric = 'reach'` alone. They are the same kind of figure with the same
 * kind of gap — `like-age.ts` names the collecting job missing a night as an
 * ordinary cause — so they run through the branch below rather than beside it.
 * A second branch is how one metric quietly loses the refusal.
 */
export function sortRows(
  rows: readonly PublishedRow[],
  key: SortKey,
  direction: SortDirection,
): PublishedRow[] {
  const sign = direction === 'asc' ? 1 : -1

  if (isMetricSortKey(key)) {
    const field = METRIC_FIELD[key]
    const measured = rows.filter((row) => row[field] !== null)
    const unmeasured = rows.filter((row) => row[field] === null)
    measured.sort(
      (a, b) =>
        sign * ((a[field] as number) - (b[field] as number)) || a.title.localeCompare(b.title),
    )
    // Ties broken by title in both lists, so the same data never renders two
    // different orders on two loads.
    unmeasured.sort((a, b) => a.title.localeCompare(b.title))
    return [...measured, ...unmeasured]
  }

  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (key === 'published') return sign * a.publishedAt.localeCompare(b.publishedAt)
    if (key === 'channel')
      return sign * a.channel.localeCompare(b.channel) || a.title.localeCompare(b.title)
    return sign * a.title.localeCompare(b.title)
  })
  return sorted
}

export interface Page<T> {
  rows: T[]
  page: number
  pages: number
  total: number
}

/** One page of rows, with the page count a reader can see. */
export function pageOf<T>(rows: readonly T[], page: number, size = PAGE_SIZE): Page<T> {
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  // A page number past the end shows the last page rather than an empty table.
  // A blank screen after clicking "next" reads as a fault, not as an end.
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (current - 1) * size
  return { rows: rows.slice(start, start + size), page: current, pages, total }
}

/** Rollup for one channel's card, ordered by the caller. */
/**
 * A summed metric, and how many rows carried one.
 *
 * COVERAGE IS PER METRIC, and that is the whole reason this is a pair rather
 * than a bare number. A channel can hold reach on five of its posts and
 * impressions on two — the nightly job captures the three metrics separately and
 * a platform can report one without the others. Sharing one `measured` count
 * across all three would print a denominator that is true of one of them and
 * flattering to the rest.
 */
export interface MetricRollup {
  /** Null when nothing on this channel reported it. Never 0 — that is a measurement. */
  total: number | null
  measured: number
}

export interface ChannelRollup {
  channel: Channel
  posts: number
  /** Sum of reach at the shared age, and how many rows carried one. */
  reach: number | null
  measured: number
  /** The same, for the two metrics the window read gained on 2026-09-04. */
  impressions: MetricRollup
  engagement: MetricRollup
  best: PublishedRow | null
}

/** Sum one metric over a channel's rows, keeping its own coverage. */
function rollUp(rows: readonly PublishedRow[], key: MetricSortKey): MetricRollup {
  const field = METRIC_FIELD[key]
  const measured = rows.filter((row) => row[field] !== null)
  return {
    total:
      measured.length === 0 ? null : measured.reduce((sum, row) => sum + (row[field] as number), 0),
    measured: measured.length,
  }
}

/**
 * One rollup per channel present in the rows.
 *
 * `reach` is null rather than 0 when nothing on that channel reported, and
 * `measured` is rendered beside it: a sum from two of a channel's nine posts is
 * a subtotal, and a card that hides that is the same defect as a total that
 * skipped its gaps.
 */
export function byChannel(rows: readonly PublishedRow[]): ChannelRollup[] {
  const groups = new Map<Channel, PublishedRow[]>()
  for (const row of rows) {
    const list = groups.get(row.channel) ?? []
    list.push(row)
    groups.set(row.channel, list)
  }

  const out: ChannelRollup[] = []
  for (const [channel, list] of groups) {
    const measured = list.filter((row) => row.reachAtAge !== null)
    const best = measured.reduce<PublishedRow | null>(
      (top, row) =>
        top === null || (row.reachAtAge as number) > (top.reachAtAge as number) ? row : top,
      null,
    )
    const reach = rollUp(list, 'reach')
    out.push({
      channel,
      posts: new Set(list.map((row) => row.postId)).size,
      reach: reach.total,
      measured: reach.measured,
      impressions: rollUp(list, 'impressions'),
      engagement: rollUp(list, 'engagement'),
      best,
    })
  }

  // Ordered by reach, and a channel with nothing measured sorts last rather
  // than as a zero — the same refusal the table's ordering makes.
  return out.sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1) || a.channel.localeCompare(b.channel))
}
