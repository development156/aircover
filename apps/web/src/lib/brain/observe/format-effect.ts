import type { MarketingObservation, ObservationDatum } from '@sahoda/shared'

import { engagementRate, MIN_RATE, MIN_RATIO } from './channel-return'
import { featuresOf } from './post-features'

/**
 * FORMAT EFFECT — "your shorter posts earn more attention than your longer ones."
 *
 * ── THE DECISION THIS CHANGES ────────────────────────────────────────────────
 * `channel_return` says WHERE to spend the next evening. This says WHAT to write
 * when you get there, which is the harder and more useful half. docs/53's first
 * moment is this shape: a suggestion carrying a receipt drawn from the
 * customer's own posts rather than from marketing folklore.
 *
 * ── WHY LENGTH, AND WHY A MEDIAN SPLIT ───────────────────────────────────────
 * Length is the only attribute EVERY post has. MEASURED in production
 * 2026-08-26: 0 of 53 captions open with a question, so a comparison built on
 * opener type could not fire for any customer we currently have — it would be a
 * computer that only ever declines, which is indistinguishable from a broken
 * one.
 *
 * The split is at the customer's OWN median rather than at a fixed character
 * count. A hard threshold would be a marketing opinion baked into a maths
 * function: "short" is different for a bakery and a law firm, and any constant
 * picked here would be wrong for one of them. A median splits each business
 * against itself, produces two equally sized arms by construction, and needs no
 * number anybody has to defend.
 */

/** A published caption with what it earned. */
export interface FeaturedPost {
  postId: string
  /** The caption as published on this channel. */
  body: string
  engagement: number
  reach: number
  /** ISO date, YYYY-MM-DD. */
  measuredOn: string
}

export type NoFormatReason =
  | 'no_metrics'
  | 'window_too_short'
  | 'too_few_posts'
  /** The two halves are near enough the same length that "shorter" means nothing. */
  | 'lengths_too_similar'
  | 'no_engagement'
  | 'too_close_to_call'

export interface FormatEffectResult {
  /** Present exactly when `reason` is null. */
  observation: MarketingObservation | null
  reason: NoFormatReason | null
}

export const FORMAT_EFFECT_SUBJECT = 'caption_length'

/** Posts per arm, matching the sibling performance computers. */
export const MIN_POSTS_PER_ARM = 5

/** Days the measurements must span. Matches `channel_return`, for its reason. */
export const MIN_WINDOW_DAYS = 14

/**
 * How much longer the long arm must actually be.
 *
 * Half as much again. A median always produces two arms, even when every
 * caption is within ten characters of every other — and calling one of those
 * halves "your shorter posts" would be true and meaningless. This is the gate
 * that stops the split inventing a distinction the writing does not have.
 */
export const MIN_LENGTH_SEPARATION = 1.5

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function spanDays(earliest: string, latest: string): number {
  const ms = Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)
  return Math.floor(ms / 86_400_000) + 1
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Compare a business's shorter captions against its longer ones.
 *
 * `computedOn` is passed in rather than read from the clock, so a re-run of the
 * same Sunday produces the same row.
 */
export function formatEffect(
  posts: readonly FeaturedPost[],
  computedOn: string,
): FormatEffectResult {
  if (posts.length === 0) return { observation: null, reason: 'no_metrics' }

  /** A post nobody reached has no rate. Dropped, never counted as a zero. */
  const measurable = posts.filter((p) => p.reach > 0)
  if (measurable.length === 0) return { observation: null, reason: 'no_metrics' }

  const dates = measurable.map((p) => p.measuredOn).sort((a, b) => a.localeCompare(b))
  const earliest = dates[0]
  const latest = dates[dates.length - 1]
  if (earliest === undefined || latest === undefined) {
    return { observation: null, reason: 'no_metrics' }
  }
  const windowDays = spanDays(earliest, latest)
  if (windowDays < MIN_WINDOW_DAYS) {
    return { observation: null, reason: 'window_too_short' }
  }

  const ranked = [...measurable]
    .map((p) => ({ post: p, length: featuresOf(p.body).length, rate: engagementRate(p) }))
    .sort((a, b) => a.length - b.length)

  /**
   * The middle post is DROPPED on an odd count rather than lent to both arms,
   * which is the rule `tone-drift.ts` and `edit-distance.ts` already follow. A
   * post counted twice would pull both means toward each other and shrink the
   * very gap the gates below are trying to measure.
   */
  const half = Math.floor(ranked.length / 2)
  const shorter = ranked.slice(0, half)
  const longer = ranked.slice(ranked.length - half)

  if (shorter.length < MIN_POSTS_PER_ARM || longer.length < MIN_POSTS_PER_ARM) {
    return { observation: null, reason: 'too_few_posts' }
  }

  const shortLen = mean(shorter.map((r) => r.length))
  const longLen = mean(longer.map((r) => r.length))
  if (shortLen <= 0 || longLen / shortLen < MIN_LENGTH_SEPARATION) {
    return { observation: null, reason: 'lengths_too_similar' }
  }

  const shortRate = mean(shorter.map((r) => r.rate))
  const longRate = mean(longer.map((r) => r.rate))
  const best = Math.max(shortRate, longRate)
  const worst = Math.min(shortRate, longRate)
  if (best < MIN_RATE) return { observation: null, reason: 'no_engagement' }
  if (worst > 0 && best / worst < MIN_RATIO) {
    return { observation: null, reason: 'too_close_to_call' }
  }

  const shorterWon = shortRate > longRate
  const pct = (rate: number) => `${Math.round(rate * 100)}%`
  const claim = shorterWon
    ? `Your shorter posts earn more attention per reader: ${pct(shortRate)} across your ` +
      `${shorter.length} shortest, against ${pct(longRate)} across your ${longer.length} longest.`
    : `Your longer posts earn more attention per reader: ${pct(longRate)} across your ` +
      `${longer.length} longest, against ${pct(shortRate)} across your ${shorter.length} shortest.`

  const data: ObservationDatum[] = [
    { label: 'Attention per reader, shorter half', value: round(shortRate), unit: 'ratio' },
    { label: 'Attention per reader, longer half', value: round(longRate), unit: 'ratio' },
    { label: 'Characters, shorter half', value: Math.round(shortLen), unit: 'count' },
    { label: 'Characters, longer half', value: Math.round(longLen), unit: 'count' },
  ]

  return {
    reason: null,
    observation: {
      kind: 'format_effect',
      subject: FORMAT_EFFECT_SUBJECT,
      claim,
      evidence: {
        data,
        postIds: [...shorter, ...longer].map((r) => r.post.postId),
        windowDays,
      },
      computedOn,
    },
  }
}
