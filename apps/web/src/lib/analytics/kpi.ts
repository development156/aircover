import type { AccountAnalytics } from '@/lib/analytics/account-insights'
import {
  changeFor,
  type Change,
  type HeadlineAbsence,
  MIN_BASELINE_WEEKS,
} from '@/lib/analytics/headline'
import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * THE FIVE FIGURES THIS PRODUCT CAN ACTUALLY PUT AT THE TOP OF /analytics.
 *
 * ── HOW THIS IS DIFFERENT FROM `headline.ts`, WHICH SITS BESIDE IT ───────────
 * `headline.ts` is the record of what this product CANNOT measure: unique
 * people reached, people who replied, enquiries attributed to a post. Three of
 * its four cards are a written refusal, and they stay, because a reader who
 * cannot see that a figure is missing assumes it is zero.
 *
 * This file is the other half: everything the stored snapshots and the account
 * read genuinely support, each with the same window-against-window comparison
 * the rest of the page makes, and each with the exact claim it is making
 * written on the card.
 *
 * `Posts this period` MOVED HERE from `headline.ts`'s fourth card rather than
 * being copied. Two cards on one screen carrying the same count under two
 * labels is how two numbers come to disagree after somebody edits one of them.
 *
 * ── EVERY SUM SKIPS WHAT IT DOES NOT HOLD, AND SAYS SO ───────────────────────
 * A row's `reachAtAge` is null when we hold no reading for that post on that
 * channel on the shared day. Adding it as a zero understates the total and
 * drags the rate down, and neither the number nor the reader would ever know.
 * So a sum carries its own denominator, how many of the window's rows
 * contributed, and the card prints it whenever it is short of all of them.
 *
 * Pure: no I/O, no clock, no React.
 */

/** The reading columns a sum may be taken over. */
export type SummableKey = 'reachAtAge' | 'impressionsAtAge' | 'engagementAtAge'

export interface Sum {
  /** Null when NOTHING was measured. Never a zero standing in for an absence. */
  total: number | null
  /** How many rows carried a reading. */
  measured: number
  /** How many rows there were. `measured < posts` makes the total a subtotal. */
  posts: number
}

export function sumAt(rows: readonly PublishedRow[], key: SummableKey): Sum {
  let total = 0
  let measured = 0
  for (const row of rows) {
    const value = row[key]
    if (value === null) continue
    total += value
    measured += 1
  }
  return { total: measured === 0 ? null : total, measured, posts: rows.length }
}

export interface Rate {
  /** A fraction, not a percentage. Null when it cannot be formed honestly. */
  rate: number | null
  measured: number
  posts: number
}

/**
 * Engagement as a share of reach, over the rows that carry BOTH readings.
 *
 * A row missing either half contributes to NEITHER, which is the only way the
 * two halves describe the same population. Summing all the engagement we hold
 * over only the reach we hold is a ratio between two different sets of posts,
 * and it is always too high.
 *
 * A denominator of zero is null rather than infinity and rather than 0%. Reach
 * of none with engagement on it is not a rate; it is a contradiction in the
 * platform's own reporting, and the honest answer is the absence mark.
 */
export function engagementRateOf(rows: readonly PublishedRow[]): Rate {
  let engagement = 0
  let reach = 0
  let measured = 0
  for (const row of rows) {
    if (row.engagementAtAge === null || row.reachAtAge === null) continue
    engagement += row.engagementAtAge
    reach += row.reachAtAge
    measured += 1
  }
  if (measured === 0 || reach <= 0) return { rate: null, measured, posts: rows.length }
  return { rate: engagement / reach, measured, posts: rows.length }
}

/**
 * The post with the most engagement, or nothing.
 *
 * Ranked on engagement ALONE. Falling back to reach when engagement was not
 * captured would put a post at the top of a list the reader is told is about
 * engagement, using a number that is not engagement.
 */
export function bestPostOf(rows: readonly PublishedRow[]): PublishedRow | null {
  let best: PublishedRow | null = null
  for (const row of rows) {
    if (row.engagementAtAge === null) continue
    if (best === null || row.engagementAtAge > (best.engagementAtAge ?? -1)) best = row
  }
  return best
}

/** What sits at the foot of a card: a comparison, or a statement of basis. */
export type KpiFooter =
  | { kind: 'change'; change: Change }
  /**
   * A card that has no previous window to compare against, for a reason that is
   * not "we did not measure".
   *
   * The follower count is the case this exists for. `changeFor` would answer
   * `no-previous`, whose sentence is "Nothing measured in the last 30 days
   * before this", a claim about a window Instagram was never asked about. It
   * answers the CURRENT count and nothing else, so the card says that instead.
   */
  | { kind: 'note'; text: string }

export type KpiId = 'engagement-rate' | 'reach-total' | 'followers' | 'posts' | 'best-post'

export interface Kpi {
  id: KpiId
  label: string
  /** The reading, or null with `absence` saying which kind of nothing. */
  value: number | null
  format: 'count' | 'percent'
  /** Words instead of a number, for the card that names a post. */
  text?: string
  link?: { label: string; href: string }
  absence?: HeadlineAbsence
  /** What the figure counts, in the reader's terms. Always rendered. */
  caveat: string
  footer: KpiFooter
  /** Stated only when the sum covered fewer rows than the window holds. */
  coverage?: { measured: number; posts: number }
}

/** The follower reading, or which kind of nothing stands in for it. */
export type FollowerReading =
  { kind: 'ready'; value: number } | { kind: 'absent'; absence: HeadlineAbsence }

/**
 * The account panel's own state, as a follower reading.
 *
 * The four absences are kept apart all the way to the card, because they are
 * four different sentences and only one of them is worth a retry. Telling a
 * customer to connect an account they already connected is the inversion
 * `lib/inbox/read.ts` documents at length.
 */
export function followersFromAccount(account: AccountAnalytics): FollowerReading {
  switch (account.kind) {
    case 'ready': {
      const last = account.followers[account.followers.length - 1]
      // No point in the window is not a count of zero followers. It is no
      // reading, which is what the platform actually told us.
      return last === undefined
        ? { kind: 'absent', absence: 'waiting' }
        : { kind: 'ready', value: last.value }
    }
    case 'not-connected':
      return { kind: 'absent', absence: 'not-connected' }
    case 'reconnect':
      // The account IS connected and its permission lapsed. "Nothing connected"
      // would send the reader to add a second one.
      return { kind: 'absent', absence: 'unreadable' }
    case 'not-configured':
    case 'unreadable':
      return { kind: 'absent', absence: 'unreadable' }
  }
}

export interface KpiInput {
  rows: readonly PublishedRow[]
  /** The window before this one, read at the SAME age. See `buildWindowRows`. */
  previousRows: readonly PublishedRow[]
  postsPublished: number
  postsPublishedPrevious: number | null
  weeksOfHistory: number
  followers: FollowerReading
}

/** Four places on a fraction, so a rate of 4.37% is not 4.3700000001%. */
function round(rate: number): number {
  return Math.round(rate * 10_000) / 10_000
}

export function analyticsKpis({
  rows,
  previousRows,
  postsPublished,
  postsPublishedPrevious,
  weeksOfHistory,
  followers,
}: KpiInput): Kpi[] {
  const reach = sumAt(rows, 'reachAtAge')
  const reachBefore = sumAt(previousRows, 'reachAtAge')
  const rate = engagementRateOf(rows)
  const rateBefore = engagementRateOf(previousRows)
  const best = bestPostOf(rows)

  const coverage = (sum: { measured: number; posts: number }) =>
    sum.measured > 0 && sum.measured < sum.posts
      ? { measured: sum.measured, posts: sum.posts }
      : undefined

  return [
    {
      id: 'engagement-rate',
      label: 'Engagement rate',
      value: rate.rate === null ? null : round(rate.rate),
      format: 'percent',
      absence: rate.rate === null ? 'waiting' : undefined,
      caveat:
        'Likes, comments, shares and saves together, as a share of the people your posts reached.',
      footer: {
        kind: 'change',
        change: changeFor(rate.rate, rateBefore.rate, weeksOfHistory),
      },
      coverage: coverage(rate),
    },
    {
      id: 'reach-total',
      label: 'Reach across your posts',
      value: reach.total,
      format: 'count',
      absence: reach.total === null ? 'waiting' : undefined,
      // NOT "people reached". Reach is reported per post, so somebody who saw
      // two of these posts is in this figure twice. `headline.ts` keeps the
      // unique version as a card that says out loud it cannot be measured, and
      // this one must never be read as that.
      caveat: 'Added up post by post, so somebody who saw two of your posts is counted in both.',
      footer: { kind: 'change', change: changeFor(reach.total, reachBefore.total, weeksOfHistory) },
      coverage: coverage(reach),
    },
    {
      id: 'followers',
      label: 'Followers',
      value: followers.kind === 'ready' ? followers.value : null,
      format: 'count',
      absence: followers.kind === 'absent' ? followers.absence : undefined,
      caveat: 'The latest count Instagram reported for your connected account.',
      footer: {
        kind: 'note',
        text: 'A count of right now, not of this period.',
      },
    },
    {
      id: 'posts',
      label: 'Posts this period',
      value: postsPublished,
      format: 'count',
      caveat: 'Counts each post once, however many channels it went to.',
      footer: {
        kind: 'change',
        change: changeFor(postsPublished, postsPublishedPrevious, weeksOfHistory),
      },
    },
    {
      id: 'best-post',
      label: 'Best post',
      value: best?.engagementAtAge ?? null,
      format: 'count',
      absence: best === null ? 'waiting' : undefined,
      text: best?.title,
      link: best ? { label: 'Open the post', href: `/posts/${best.postId}` } : undefined,
      caveat: 'The post with the most likes, comments, shares and saves in this period.',
      footer: {
        kind: 'note',
        text:
          weeksOfHistory < MIN_BASELINE_WEEKS
            ? 'Still learning your normal'
            : 'Ranked on engagement, and only among posts Sahoda holds a reading for.',
      },
    },
  ]
}
