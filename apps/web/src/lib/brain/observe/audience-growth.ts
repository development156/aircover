import type { MarketingObservation, ObservationDatum } from '@sahoda/shared'

/**
 * AUDIENCE GROWTH — "you have gained 41 followers on Instagram since July."
 *
 * ── THE DECISION THIS CHANGES ────────────────────────────────────────────────
 * Am I growing, or just busy? A shop owner who posts four times a week and
 * cannot tell whether it is working will either stop or carry on for the wrong
 * reason. Everything else the Marketing Brain says is about individual posts;
 * this is the only measurement about the BUSINESS.
 *
 * ── IT DIFFS `total`, AND THAT IS NOT THE OBVIOUS CHOICE ─────────────────────
 * `audience_snapshots` carries `gained` and `lost` buckets that would answer
 * this directly. MEASURED in production 2026-08-26: all 14 `gained` rows and all
 * 14 `lost` rows are ZERO, on every account, on every day, while `total` moves.
 * A computer built on the obvious columns would have declined forever, and the
 * reason would have looked like "no growth" rather than "we read the wrong
 * column".
 *
 * ── THE RECEIPT IS NOT A LIST OF POSTS, DELIBERATELY ─────────────────────────
 * Followers are not posts. Citing the posts published during the window would
 * make the row imply THOSE POSTS CAUSED THE GROWTH, which is a causal claim
 * nothing here measured. `OBSERVATION_BASIS` marks this kind `audience` and the
 * row schema then REFUSES a post list on it. The receipt is the two follower
 * counts in `evidence.data`, which the customer can check on their own profile.
 */

/** One reading of one account's follower count. */
export interface AudienceReading {
  /** The connected account. Several accounts can share a channel. */
  accountId: string
  /** `instagram`, `linkedin`, … — a lowercase platform key. */
  channel: string
  /** ISO date, YYYY-MM-DD. */
  measuredOn: string
  /** Followers at that moment. The `total` bucket, never `gained` or `lost`. */
  total: number
}

/** Why a workspace produced no growth claim. Each is a different sentence. */
export type NoGrowthReason =
  /** No follower reading exists at all. */
  | 'no_audience_data'
  /** Readings exist but span too little time to call it a trend. */
  | 'window_too_short'
  /** No account has two readings, so nothing can be compared to anything. */
  | 'too_few_readings'
  /** The audience is small enough that any change reads as a huge percentage. */
  | 'audience_too_small'
  /** It moved, but by less than ordinary churn. */
  | 'change_too_small'

export interface AudienceGrowthResult {
  /** Present exactly when `reason` is null. */
  observation: MarketingObservation | null
  reason: NoGrowthReason | null
}

/**
 * Days the readings must span before a direction is a trend.
 *
 * Twenty-one, matching `tone_drift`, and for the same reason rather than for
 * symmetry: both claim something CHANGED about the business, and three weeks is
 * the shortest stretch in which a change can be told apart from a good week.
 */
export const MIN_WINDOW_DAYS = 21

/**
 * Readings an account needs before its own delta counts.
 *
 * Two: a first and a last. This is not a quality floor, it is arithmetic — one
 * reading has nothing to be compared against.
 */
export const MIN_READINGS_PER_ACCOUNT = 2

/**
 * Followers required before a percentage means anything.
 *
 * Twenty-five, and this is the honesty gate of the whole computer. MEASURED in
 * production 2026-08-26: three of the four connected accounts sit at ONE
 * follower. Going from one to two is +100% growth, arithmetically perfect and
 * absurd to show a person. Below this floor the computer says nothing rather
 * than something technically true.
 */
export const MIN_AUDIENCE = 25

/**
 * How much it must move, as a share of where it started.
 *
 * Five percent. Below that is unfollow churn, a bot sweep, or the platform
 * recounting — none of which is the customer's marketing working or failing.
 */
export const MIN_CHANGE = 0.05

/** Inclusive, so a single day of readings spans 1 rather than 0. */
function spanDays(earliest: string, latest: string): number {
  const ms = Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)
  return Math.floor(ms / 86_400_000) + 1
}

/**
 * The claim, in the customer's terms, in whichever direction it actually went.
 *
 * A fall is stated as plainly as a rise. A product that only speaks when the
 * news is good is a product whose silence is bad news, which is worse than
 * saying it.
 */
function claimFor(channel: string, from: number, to: number, days: number): string {
  const label = channel.charAt(0).toUpperCase() + channel.slice(1)
  const moved = Math.abs(to - from)
  return to > from
    ? `Your ${label} audience is growing: ${moved} more followers than ${days} days ago, ` +
        `${from} to ${to}.`
    : `Your ${label} audience is shrinking: ${moved} fewer followers than ${days} days ago, ` +
        `${from} to ${to}.`
}

/**
 * Measure one channel's audience against itself, and decline unless the move is
 * real, big enough to matter, and on an audience large enough to describe.
 *
 * Readings for ONE channel are expected; the caller groups them. `computedOn` is
 * passed in rather than read from the clock so a re-run of the same Sunday
 * produces the same row.
 */
export function audienceGrowth(
  readings: readonly AudienceReading[],
  channel: string,
  computedOn: string,
): AudienceGrowthResult {
  if (readings.length === 0) return { observation: null, reason: 'no_audience_data' }

  const dates = readings.map((r) => r.measuredOn).sort((a, b) => a.localeCompare(b))
  const earliest = dates[0]
  const latest = dates[dates.length - 1]
  if (earliest === undefined || latest === undefined) {
    return { observation: null, reason: 'no_audience_data' }
  }

  const windowDays = spanDays(earliest, latest)
  if (windowDays < MIN_WINDOW_DAYS) {
    return { observation: null, reason: 'window_too_short' }
  }

  /**
   * Per account, then summed — not a sum of totals per DAY.
   *
   * Accounts are connected and disconnected at different times, so on any given
   * day some are missing. Summing by day would make a workspace look like it
   * lost an audience on the day an account stopped reporting. Each account
   * contributes its own first-to-last delta over whatever stretch it actually
   * covered, and an account with one reading contributes nothing rather than
   * contributing a zero.
   */
  const byAccount = new Map<string, AudienceReading[]>()
  for (const reading of readings) {
    const bucket = byAccount.get(reading.accountId)
    if (bucket) bucket.push(reading)
    else byAccount.set(reading.accountId, [reading])
  }

  let from = 0
  let to = 0
  let counted = 0
  for (const series of byAccount.values()) {
    if (series.length < MIN_READINGS_PER_ACCOUNT) continue
    const sorted = [...series].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first === undefined || last === undefined) continue
    from += first.total
    to += last.total
    counted += 1
  }

  if (counted === 0) return { observation: null, reason: 'too_few_readings' }
  if (from < MIN_AUDIENCE) return { observation: null, reason: 'audience_too_small' }
  if (Math.abs(to - from) / from < MIN_CHANGE) {
    return { observation: null, reason: 'change_too_small' }
  }

  const data: ObservationDatum[] = [
    { label: `Followers ${windowDays} days ago`, value: from, unit: 'count' },
    { label: 'Followers now', value: to, unit: 'count' },
    { label: 'Days measured', value: windowDays, unit: 'days' },
  ]

  return {
    reason: null,
    observation: {
      kind: 'audience_growth',
      /** The channel IS the subject, so one workspace can hold one row per channel. */
      subject: channel,
      claim: claimFor(channel, from, to, windowDays),
      /** Empty on purpose. See the header, and `OBSERVATION_BASIS`. */
      evidence: { data, postIds: [], windowDays },
      computedOn,
    },
  }
}
