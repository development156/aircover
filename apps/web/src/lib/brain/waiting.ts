import type { ObservationKind } from '@sahoda/shared'

import {
  MIN_AUDIENCE,
  MIN_READINGS_PER_ACCOUNT,
  MIN_WINDOW_DAYS as GROWTH_DAYS,
} from './observe/audience-growth'
import { MIN_POSTS_PER_CHANNEL, MIN_WINDOW_DAYS as CHANNEL_DAYS } from './observe/channel-return'
import {
  MIN_POSTS_PER_WINDOW as DELTA_POSTS,
  MIN_WINDOW_DAYS as DELTA_DAYS,
} from './observe/edit-distance'
import { MIN_POSTS_PER_ARM, MIN_WINDOW_DAYS as FORMAT_DAYS } from './observe/format-effect'
import {
  MIN_POSTS_PER_WINDOW as DRIFT_POSTS,
  MIN_WINDOW_DAYS as DRIFT_DAYS,
} from './observe/tone-drift'

/**
 * WHY THE REPORT IS EMPTY, IN THE READER'S WORDS.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * The block on /report used to say "Nothing yet. Sahoda looks at your published
 * posts once a week…" and said exactly that in week 1 and in week 20. A static
 * sentence cannot distinguish a product that is working and waiting from a cron
 * that stopped in March, so a customer with a long-empty report has no way to
 * tell whether anything is watching at all. The brain is most invisible
 * precisely when it has run longest with nothing to say.
 *
 * ── IT IS MODELLED ON lib/inbox/emptiness.ts, INCLUDING ITS DISCIPLINE ───────
 * That file exists to keep eight kinds of nothing apart, and its tests assert
 * the CLAIM rather than the wording so a sentence can be rewritten freely
 * without weakening the guarantee. Same here: the tests below assert that a
 * never-examined workspace is never told it is waiting, and that every sentence
 * carries the real threshold, not that any particular phrasing survives.
 *
 * ── THE NUMBERS COME FROM THE COMPUTERS, NOT FROM THIS FILE ──────────────────
 * Every threshold below is imported from the module that gates on it. A copy of
 * "five posts" written here would be a second source of truth for a product
 * promise, and it would go quietly wrong the first time somebody tuned a floor.
 * `waiting.test.ts` asserts the sentence against the imported constant, so the
 * two cannot drift.
 *
 * ── WHAT IT MUST NEVER DO ────────────────────────────────────────────────────
 * Offer a remedy that cannot work (`no-impossible-remedy.spec.ts`). Reloading
 * does not create a post, and connecting an account does not backdate three
 * weeks of history. Every sentence below either names something the reader can
 * actually do, or states plainly that the only remedy is time.
 */

/** What the pass recorded about one workspace on the day it last looked. */
export interface PassRun {
  /** ISO day, `YYYY-MM-DD`. */
  computedOn: string
  /** Kind to reason, for the computers that produced nothing. */
  declines: Readonly<Record<string, string>>
  written: number
}

export type BrainWaiting =
  /**
   * No pass has examined this workspace. NOT the same claim as waiting, and
   * conflating the two would tell a customer Sahoda is patiently watching a
   * workspace it has never opened.
   */
  | { state: 'never-examined' }
  /** It looked, on this day, and here is what each computer is still short of. */
  | { state: 'waiting'; lastLookedOn: string; reasons: readonly string[] }

/** What each computer is trying to answer, as the reader would say it. */
const SUBJECT: Record<ObservationKind, string> = {
  tone_drift: 'whether your writing has drifted',
  edit_distance: 'how much you rewrite what Sahoda drafts',
  channel_return: 'which channel earns you the most attention',
  audience_growth: 'whether your audience is growing',
  format_effect: 'whether shorter or longer posts do better',
}

/**
 * The threshold that applies per kind, so a window sentence says the real span.
 *
 * They genuinely differ and the difference is the design: a claim that a HABIT
 * changed needs three weeks on both sides, while a claim that one channel
 * currently returns more needs only a fortnight of measurements.
 */
const WINDOW_DAYS: Record<ObservationKind, number> = {
  tone_drift: DRIFT_DAYS,
  edit_distance: DELTA_DAYS,
  channel_return: CHANNEL_DAYS,
  audience_growth: GROWTH_DAYS,
  format_effect: FORMAT_DAYS,
}

/** How many posts each side of a comparison needs, where the kind counts posts. */
const POSTS_NEEDED: Partial<Record<ObservationKind, number>> = {
  tone_drift: DRIFT_POSTS,
  edit_distance: DELTA_POSTS,
  channel_return: MIN_POSTS_PER_CHANNEL,
  format_effect: MIN_POSTS_PER_ARM,
}

/**
 * One sentence for one computer's silence.
 *
 * Returns null where the silence is not a shortfall but an answer: "the two
 * channels are too close to call" is a finding, not a wait, and printing it as
 * one would tell a customer to keep posting for a verdict that has already
 * arrived. Those are dropped rather than reworded, because the honest version
 * of them belongs in an observation with a receipt, not in an empty state.
 */
export function waitingSentence(kind: ObservationKind, reason: string): string | null {
  const subject = SUBJECT[kind]
  const days = WINDOW_DAYS[kind]
  const posts = POSTS_NEEDED[kind]

  switch (reason) {
    case 'no_posts':
      return `To say ${subject}, Sahoda needs posts you have published. It has none yet.`
    case 'too_few_posts':
      return posts
        ? `To say ${subject}, Sahoda needs at least ${posts} posts on each side of the comparison.`
        : `To say ${subject}, Sahoda needs more posts than it has.`
    case 'window_too_short':
      return `To say ${subject}, Sahoda needs your posts to span at least ${days} days. Only time fixes this one.`
    case 'no_captured_drafts':
      return `To say ${subject}, Sahoda needs posts it drafted and you then edited. It has none it can compare.`
    case 'no_metrics':
      return `To say ${subject}, Sahoda needs the platforms to report how your posts did. Connect an account and the figures arrive nightly.`
    case 'no_engagement':
      return `To say ${subject}, Sahoda needs posts that were engaged with. Too few people have reacted so far.`
    case 'no_audience_data':
      return `To say ${subject}, Sahoda needs follower counts from a connected account. It has none.`
    case 'too_few_readings':
      return `To say ${subject}, Sahoda needs at least ${MIN_READINGS_PER_ACCOUNT} follower readings for an account. Only time fixes this one.`
    case 'audience_too_small':
      return `To say ${subject}, Sahoda needs an audience of at least ${MIN_AUDIENCE}. A handful of followers moving is not a trend.`
    case 'no_baseline':
      return `To say ${subject}, Sahoda needs a habit strong enough to have changed. You barely did the thing it measures.`
    // Findings rather than shortfalls. See the note above.
    case 'change_too_small':
    case 'not_improving':
    case 'too_close_to_call':
    case 'lengths_too_similar':
      return null
    default:
      // A reason this file has never heard of. Silence beats a guess: a
      // sentence invented here would be a claim about the reader's business
      // that no computer made.
      return null
  }
}

/**
 * The whole empty state, from what the pass recorded.
 *
 * `run` is null when no row exists — which is either "never examined" or "the
 * pass threw on this workspace", and the runner writes no row in the second
 * case on purpose. Both are honestly described by not claiming to have looked.
 */
export function brainWaiting(run: PassRun | null): BrainWaiting {
  if (!run) return { state: 'never-examined' }

  const reasons: string[] = []
  for (const [kind, reason] of Object.entries(run.declines)) {
    if (!(kind in SUBJECT)) continue
    const sentence = waitingSentence(kind as ObservationKind, reason)
    if (sentence) reasons.push(sentence)
  }

  return { state: 'waiting', lastLookedOn: run.computedOn, reasons }
}
