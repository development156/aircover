import type { MetricAvailability } from '@sahoda/publishing'
import type { Channel } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { formatScheduledAt } from '@/lib/posts/schedule-format'

/**
 * What each metric state SAYS, kept out of JSX so it can be tested.
 *
 * Every string here is a claim, and the wrong one is the whole failure this feature
 * had to avoid: "0 impressions" and "not available yet" describe the same response
 * body, and only one of them is true. Keeping the copy pure means the mapping from
 * state to sentence is covered by tests rather than by reading the markup.
 *
 * Tone follows the design system: sentence case, and never an apology for a state
 * that is simply normal. A post published this morning having no Instagram data is
 * not an error — it is Instagram working as documented.
 */

export interface MetricCopy {
  /** The short line. Shown wherever there is room for one line only. */
  headline: string
  /** The reason, when there is one worth giving. */
  detail: string | null
  /**
   * How certain this is, for the visual treatment. `waiting` states resolve on
   * their own; `blocked` ones need someone to do something; `none` claims nothing.
   */
  tone: 'waiting' | 'blocked' | 'none'
}

/** Roughly how long the wait is, in words. Exact hours read falsely precise. */
function lagPhrase(hours: number): string {
  if (hours >= 48) return 'about two days'
  if (hours >= 24) return 'about a day'
  return `about ${Math.max(1, Math.round(hours))} hours`
}

/**
 * The four ways a metric can be "not available yet".
 *
 * All four share a headline, because to the reader they are one situation: there is
 * no number to act on, nothing is wrong, don't act. Only the reason differs, and the
 * reason is what stops the wait feeling like a fault.
 *
 * Only `lag` names a date, and only because only `lag` knows one. The others say what
 * they know and stop, rather than borrowing a deadline from a platform that never
 * gave one.
 */
function pendingCopy(
  state: Extract<MetricAvailability, { kind: 'pending' }>,
  name: string,
): MetricCopy {
  const headline = 'Not available yet'

  switch (state.reason) {
    case 'lag': {
      const at = formatScheduledAt(state.availableAfter)
      return {
        headline,
        // Naming the platform matters: this is Instagram's schedule, not ours, and
        // a customer who thinks Sahoda is slow will go looking for a bug.
        detail: at
          ? `${name} reports metrics on a delay. Expected after ${at}.`
          : `${name} reports metrics on a delay.`,
        tone: 'waiting',
      }
    }
    case 'processing':
      return {
        headline,
        detail: `${name} has this post but has not returned its metrics yet.`,
        tone: 'waiting',
      }
    case 'never-measured':
      // NOT "0 impressions" and NOT "no engagement". We were told nothing, which is
      // a different fact from being told zero.
      return {
        headline,
        detail: `${name} has not reported metrics for this post.`,
        tone: 'waiting',
      }
    /**
     * The channel answered, with nothing but zeroes, and we do not know how far
     * behind it reports — so we cannot tell "too early" from "measured nothing".
     *
     * Worded to survive BOTH readings, the same discipline `nothingReported` uses
     * in `account-insights.ts`. It states two facts and draws no conclusion:
     * nothing has been reported, and the delay is not published. It deliberately
     * does not say "check back after…", because there is no date to give, nor
     * "0 impressions", because no one measured that.
     */
    case 'unknown-window':
      return {
        // Keeps the shared headline rather than something like "No activity",
        // which a reader parses as a measurement of nothing — the very claim
        // this state exists to withhold.
        headline,
        detail: `${name} hasn’t reported anything for this post yet, and doesn’t publish how far behind its metrics run.`,
        tone: 'waiting',
      }
  }
}

export function metricCopy(state: MetricAvailability, channel: Channel): MetricCopy {
  const name = CHANNEL_LABELS[channel]

  switch (state.kind) {
    case 'ready': {
      const at = formatScheduledAt(state.metrics.measuredAt)
      return {
        headline: 'Measured',
        detail: at ? `Last updated ${at}` : null,
        tone: 'none',
      }
    }

    case 'pending':
      return pendingCopy(state, name)

    case 'unresolved':
      return {
        headline: 'Can’t be resolved',
        detail:
          state.message ??
          `${name} can’t tie this post back to a connected account, so its metrics can’t be looked up.`,
        tone: 'blocked',
      }

    case 'unavailable':
      switch (state.reason) {
        case 'not-published':
          return { headline: 'Not published', detail: null, tone: 'none' }
        /**
         * Says what happened instead of what is missing.
         *
         * `no-platform-id` below is the sentence this state used to borrow, and it
         * blames the channel: "Instagram didn't return a post id." For a fixture run
         * that is false in the way that matters — Instagram was never asked, so a
         * customer reading it concludes the integration is broken when in fact nothing
         * was ever sent. The channel is not named here at all, deliberately.
         */
        case 'simulated':
          return {
            headline: 'Simulated run',
            detail: 'This post was published in test mode, so it has no real metrics.',
            tone: 'blocked',
          }
        case 'no-platform-id':
          return {
            headline: 'Can’t be resolved',
            detail: `${name} didn’t return a post id, so there’s nothing to look metrics up with.`,
            tone: 'blocked',
          }
        case 'not-connected':
          return {
            headline: 'Not connected',
            detail: `Connect ${name} to see metrics.`,
            tone: 'blocked',
          }
        case 'reconnect':
          return {
            headline: 'Reconnect needed',
            detail: `Reconnect ${name} to see metrics.`,
            tone: 'blocked',
          }
        case 'unreadable':
          return {
            headline: 'Couldn’t load metrics',
            // Says what happened, and pointedly does not say the metrics are zero.
            detail: 'We couldn’t read them just now. Refresh to try again.',
            tone: 'blocked',
          }
        case 'not-loaded':
          return {
            headline: 'Not loaded here',
            // Deliberately NOT "try again" — nothing failed, and refreshing this
            // list would hit the same cap. Points at the thing that does work.
            detail: 'Open the post to see its metrics.',
            tone: 'none',
          }
      }
  }
}

/** The account-level wait, phrased the same way. */
export function accountLagCopy(hours: number): string {
  return `Instagram reports on a delay of ${lagPhrase(hours)}, so recent days may be missing.`
}

/**
 * A metric for display, or an em dash.
 *
 * `null` means the field was not reported. Rendering "0" for it would be the exact
 * fabrication this feature exists to prevent, so the dash is not a style choice.
 */
export function metricValue(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-IN')
}
