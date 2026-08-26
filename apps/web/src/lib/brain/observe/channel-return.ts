import type { MarketingObservation, ObservationDatum } from '@sahoda/shared'

/**
 * CHANNEL RETURN — "your LinkedIn posts earn more per reader than your Instagram."
 *
 * ── THE DECISION THIS CHANGES ────────────────────────────────────────────────
 * A shop owner has evenings, not a team. The question they actually face is
 * which channel is worth the next hour, and until now Sahoda could not answer
 * it: `tone_drift` describes how they write and `edit_distance` describes how
 * much they correct us. Neither says whether any of it worked.
 *
 * docs/55 sets the test every measurement must pass — name the decision that
 * changes. This one names it: stop spending evenings on the losing channel.
 *
 * ── NO MODEL CALL HERE EITHER ────────────────────────────────────────────────
 * Same guarantee `tone-drift.ts` gives, for the same reason. Every number below
 * is arithmetic over `post_metric_snapshots`, which the platforms reported. A
 * claim about the customer's own business is the one class of statement this
 * product may never invent.
 *
 * ── WHY A RATE AND NOT A COUNT ───────────────────────────────────────────────
 * MEASURED in production 2026-08-26: Instagram engagement runs 0-2 per post
 * against reach of 1-2, while LinkedIn runs engagement 2 against reach 38-39.
 * Comparing raw engagement across channels would say Instagram and LinkedIn are
 * level, which is nonsense — one was seen by two people and the other by forty.
 * Dividing by reach is what makes the two comparable at all.
 */

/** A post's outcome on one channel, at its most recent measurement. */
export interface ChannelOutcome {
  /** The post. Several rows share it when a post went to several channels. */
  postId: string
  /** `instagram`, `linkedin`, … — a lowercase platform key, never a label. */
  channel: string
  /** Interactions the platform attributed to this post. */
  engagement: number
  /** People the platform says saw it. The denominator. */
  reach: number
  /** ISO date, YYYY-MM-DD. When this measurement was taken. */
  measuredOn: string
}

/** Why a workspace produced no channel comparison. Each is a different sentence. */
export type NoChannelReason =
  /** Nothing has been measured at all. */
  | 'no_metrics'
  /** Everything measured landed inside too short a stretch to compare. */
  | 'window_too_short'
  /** Fewer than two channels carry enough posts to stand behind. */
  | 'too_few_posts'
  /** Nothing is earning anything anywhere; a ratio between two near-zeros is noise. */
  | 'no_engagement'
  /** The channels are close enough that the difference is not worth acting on. */
  | 'too_close_to_call'

export interface ChannelReturnResult {
  /** Present exactly when `reason` is null. */
  observation: MarketingObservation | null
  reason: NoChannelReason | null
}

export const CHANNEL_RETURN_SUBJECT = 'engagement_rate'

/**
 * Posts a channel needs before it can be compared.
 *
 * Five, matching `tone-drift.ts`, and for a related reason: one viral post and
 * four ordinary ones is not a property of the channel. Telling somebody to
 * abandon Instagram on the strength of three posts is advice that costs them
 * an audience they cannot get back.
 */
export const MIN_POSTS_PER_CHANNEL = 5

/**
 * Days the measurements must span.
 *
 * Fourteen, not the twenty-one `tone_drift` uses, and the difference is
 * deliberate. Tone drift claims a HABIT CHANGED, which needs enough time for a
 * habit to exist on both sides. This claims one channel currently returns more
 * than another, which is a statement about the present. Two weeks is enough for
 * a weekday/weekend cycle to even out, which is the shortest honest window.
 */
export const MIN_WINDOW_DAYS = 14

/**
 * The best channel must clear this rate before any comparison is worth making.
 *
 * Two percent. Below it every channel is failing and the interesting sentence is
 * not "LinkedIn is winning" but "nothing is working", which this computer is not
 * entitled to say — that is a different claim needing a different floor. Without
 * this gate a workspace where one channel scores 0.4% and another 0.1% would be
 * told LinkedIn returns four times as much, which is arithmetically true and
 * useless.
 */
export const MIN_RATE = 0.02

/**
 * How much better the winner must be.
 *
 * Half as much again. Below that the gap is inside what posting on a Tuesday
 * rather than a Thursday would move, and acting on it is superstition.
 */
export const MIN_RATIO = 1.5

/** Engagement per person reached, for one post. */
export function engagementRate(outcome: ChannelOutcome): number {
  if (outcome.reach <= 0) return 0
  return outcome.engagement / outcome.reach
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Inclusive, so a single day of measurements spans 1 rather than 0. */
function spanDays(earliest: string, latest: string): number {
  const ms = Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)
  return Math.floor(ms / 86_400_000) + 1
}

interface ChannelSummary {
  channel: string
  rate: number
  postIds: string[]
}

/**
 * The claim, in the customer's terms.
 *
 * "Earns more attention per reader" rather than "has a higher engagement rate":
 * the second is our vocabulary for our metric, and §4 of the copy rules is about
 * the sentence the READER gets. `channel` is a lowercase platform key, so it is
 * capitalised here rather than interpolated raw.
 */
function claimFor(best: ChannelSummary, worst: ChannelSummary, posts: number): string {
  const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1)
  const pct = (rate: number) => `${Math.round(rate * 100)}%`
  return (
    `Your ${label(best.channel)} posts earn more attention per reader than your ` +
    `${label(worst.channel)}: ${pct(best.rate)} against ${pct(worst.rate)}, ` +
    `across ${posts} posts.`
  )
}

/**
 * Compare what each channel returns, and decline unless the gap is worth acting on.
 *
 * `computedOn` is passed in rather than read from the clock so a re-run of the
 * same Sunday produces the same row, exactly as the sibling computers do.
 */
export function channelReturn(
  outcomes: readonly ChannelOutcome[],
  computedOn: string,
): ChannelReturnResult {
  if (outcomes.length === 0) return { observation: null, reason: 'no_metrics' }

  /**
   * A post nobody reached has no rate — dividing by zero reach would either
   * throw or invent one. Dropped rather than counted as a zero, because "we
   * could not measure this" and "this earned nothing" are different facts and
   * the second would drag a channel's average down on our own missing data.
   */
  const measurable = outcomes.filter((o) => o.reach > 0)
  if (measurable.length === 0) return { observation: null, reason: 'no_metrics' }

  const dates = measurable.map((o) => o.measuredOn).sort((a, b) => a.localeCompare(b))
  const earliest = dates[0]
  const latest = dates[dates.length - 1]
  if (earliest === undefined || latest === undefined) {
    return { observation: null, reason: 'no_metrics' }
  }

  const windowDays = spanDays(earliest, latest)
  if (windowDays < MIN_WINDOW_DAYS) {
    return { observation: null, reason: 'window_too_short' }
  }

  const byChannel = new Map<string, ChannelOutcome[]>()
  for (const outcome of measurable) {
    const bucket = byChannel.get(outcome.channel)
    if (bucket) bucket.push(outcome)
    else byChannel.set(outcome.channel, [outcome])
  }

  const summaries: ChannelSummary[] = []
  for (const [channel, posts] of byChannel) {
    /**
     * One post can be measured on several days; the caller hands us the latest
     * per post per channel. Counting DISTINCT posts here is belt and braces —
     * a caller that changed and started passing a history would otherwise let a
     * single post clear a floor meant to need five.
     */
    const postIds = [...new Set(posts.map((p) => p.postId))]
    if (postIds.length < MIN_POSTS_PER_CHANNEL) continue
    const rate = posts.reduce((sum, p) => sum + engagementRate(p), 0) / posts.length
    summaries.push({ channel, rate, postIds })
  }

  if (summaries.length < 2) return { observation: null, reason: 'too_few_posts' }

  summaries.sort((a, b) => b.rate - a.rate)
  const best = summaries[0]
  const worst = summaries[summaries.length - 1]
  if (best === undefined || worst === undefined) {
    return { observation: null, reason: 'too_few_posts' }
  }

  if (best.rate < MIN_RATE) return { observation: null, reason: 'no_engagement' }
  /**
   * A worst rate of exactly zero would make the ratio infinite. That IS a real
   * finding and it clears the gate honestly, so it is not special-cased — but
   * the division must not be the thing that decides it.
   */
  if (worst.rate > 0 && best.rate / worst.rate < MIN_RATIO) {
    return { observation: null, reason: 'too_close_to_call' }
  }

  const postIds = [...new Set([...best.postIds, ...worst.postIds])]
  const data: ObservationDatum[] = [
    { label: `Attention per reader, ${best.channel}`, value: round(best.rate), unit: 'ratio' },
    { label: `Attention per reader, ${worst.channel}`, value: round(worst.rate), unit: 'ratio' },
    { label: 'Posts compared', value: postIds.length, unit: 'count' },
  ]

  return {
    reason: null,
    observation: {
      kind: 'channel_return',
      subject: CHANNEL_RETURN_SUBJECT,
      claim: claimFor(best, worst, postIds.length),
      evidence: { data, postIds, windowDays },
      computedOn,
    },
  }
}
