import type { Channel } from '@sahoda/shared'

import type { GroupComparison } from '@/lib/analytics/grouped-lift'
import type { Normal } from '@/lib/analytics/like-age'
import type { WeekReport } from '@/lib/analytics/week-report'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'

/**
 * THE SENTENCES THE WEEKLY REPORT IS ALLOWED TO SAY.
 *
 * ── WHY THE COPY IS A MODULE AND NOT JSX ─────────────────────────────────────
 * The same reason `lib/inbox/emptiness.ts` is one: these are CLAIMS about
 * somebody's business, and a claim belongs where a test can assert it without
 * rendering a route. The tests assert the claim and the forbidden claim, never
 * the wording, so every sentence here can be rewritten freely and the guarantees
 * survive.
 *
 * ── THE ONE RULE ON EVERY LINE BELOW ─────────────────────────────────────────
 * A sentence must never be vaguer than the truth it stands for, and it must
 * never be truer in fewer cases than it sounds. "We have not measured enough of
 * your posts yet" and "your week was ordinary" are different facts, and only one
 * of them is about the reader. So each refusal gets its own sentence rather than
 * a shared apology, and none of them offers a remedy that cannot work: none of
 * these states is fixed by pressing anything, so none asks anybody to.
 *
 * Pure: no I/O, no clock, no React.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * "18 to 24 August", or "29 September to 5 October" across a month boundary.
 *
 * Spelled "to" rather than punctuated with a dash: the founder's 2026-08-23
 * ruling takes the en dash out of user-facing prose, and a date range is prose.
 */
export function weekLabel(startsOn: string, endsOn: string): string {
  const from = new Date(`${startsOn}T00:00:00Z`)
  const to = new Date(`${endsOn}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'Week'
  const fromMonth = MONTHS[from.getUTCMonth()] ?? ''
  const toMonth = MONTHS[to.getUTCMonth()] ?? ''
  if (fromMonth === toMonth) return `${from.getUTCDate()} to ${to.getUTCDate()} ${toMonth}`
  return `${from.getUTCDate()} ${fromMonth} to ${to.getUTCDate()} ${toMonth}`
}

/** The arm's name as a reader would say it. A weekday is already one. */
function armLabel(arm: string): string {
  return CHANNEL_LABELS[arm as Channel] ?? arm
}

export interface Verdict {
  /** The answer to "was this week good?", in one sentence. */
  headline: string
  /** The evidence for it, or the reason there is none. Never empty. */
  detail: string
  /** True when a real comparison cleared every gate. Decides the treatment. */
  found: boolean
}

/**
 * The headline, from a comparison that cleared the gates or from the gate it
 * failed.
 *
 * ── WHY THERE ARE SIX REFUSALS AND NOT ONE ───────────────────────────────────
 * The reasons are `compareGroups`'s own, and they are six different facts about
 * a customer's account: never measured, not enough posts, everything on one
 * channel, everything inside two days, numbers too small to divide, and a gap
 * too small to mention. Collapsing them into "not enough data" would tell four
 * of those six customers something false about why.
 */
export function verdictCopy(verdict: WeekReport['verdict'], channels: readonly Channel[]): Verdict {
  const { basis, comparison } = verdict

  if (comparison.kind === 'lift') {
    const lift = comparison.lift
    const leader = armLabel(lift.leader)
    const runnerUp = armLabel(lift.runnerUp)
    const headline =
      basis === 'weekday'
        ? `Your ${leader} posts reach more people than your ${runnerUp} ones.`
        : `${leader} is reaching more people for you than ${runnerUp}.`
    return {
      found: true,
      // Every figure in this sentence is a number that came out of a stored
      // reading. The sample size and the window are not decoration: they are
      // what decides whether the claim above deserves belief, and a finding from
      // six posts must not look like a finding from six hundred.
      detail:
        `${lift.leaderMean.toLocaleString('en-IN')} reached on average against ` +
        `${lift.runnerUpMean.toLocaleString('en-IN')}, from ${lift.leaderPosts} posts and ` +
        `${lift.runnerUpPosts}, measured across ${lift.windowDays} days.`,
      headline,
    }
  }

  return { found: false, ...noVerdict(comparison.reason) }
}

function noVerdict(reason: Extract<GroupComparison, { kind: 'none' }>['reason']): {
  headline: string
  detail: string
} {
  switch (reason) {
    case 'no_history':
      return {
        headline: 'Sahoda has nothing measured to judge this week by.',
        detail:
          'No reading of your posts has been stored yet, so there is no pattern to compare this week against.',
      }
    case 'too_few_posts':
      return {
        headline: 'Not enough of your posts have been measured to call this week yet.',
        detail:
          'A pattern needs at least three measured posts on each side of it. Below that, one good afternoon looks exactly like a habit.',
      }
    case 'single_group':
      /**
       * ── THE SENTENCE THAT USED TO BE HERE WAS FALSE ────────────────────────
       * It read "Everything measured so far went out on Instagram, on the same
       * days of the week", built from `channels`. Two things were wrong with it
       * and an audit caught both. `channels` is the channels THIS WEEK used
       * while the comparison ran over eight weeks, so a workspace with LinkedIn
       * posts last month was told everything it had was Instagram. And
       * `single_group` under a weekday comparison does not mean one weekday was
       * used; it means only ONE weekday reached three measured posts. Other days
       * had one or two.
       *
       * So the claim is narrowed to exactly what the gate establishes, and
       * `channels` is no longer consulted at all.
       */
      return {
        headline: 'Only one group of your posts has enough measured to compare.',
        detail:
          'Sahoda weighs your posts against each other, so it needs two sides with at least three measured posts each. Spreading them over more days, or more channels, is what gives it a second side.',
      }
    case 'too_few_days':
      return {
        headline: 'Everything measured so far falls inside a couple of days.',
        detail:
          'That is too short a stretch to tell a pattern from one good afternoon, so Sahoda is holding off rather than guessing.',
      }
    case 'numbers_too_small':
      return {
        headline: 'Your numbers are still small enough that comparing them would mislead you.',
        detail:
          'At these figures the difference between two posts can be one person opening one of them. Sahoda will call it once the numbers can carry a comparison.',
      }
    case 'difference_too_small':
      return {
        headline: 'An ordinary week. Nothing stood out enough to act on.',
        detail:
          'Sahoda compared your posts and found them close together. That is a real answer, not a missing one.',
      }
  }
}

/** "up 34% on your normal", and what that normal is made of. */
export function normalCopy(
  channel: Channel,
  normal: Normal,
): { headline: string; detail: string; direction: 'up' | 'down' | 'level' | null } {
  const label = CHANNEL_LABELS[channel] ?? channel

  if (normal.kind === 'compared') {
    const headline =
      normal.direction === 'level'
        ? `${label}: about the same as your normal.`
        : `${label}: ${normal.direction} ${normal.movePercent}% on your normal.`
    return {
      direction: normal.direction,
      headline,
      // The method is stated because it is the only thing that makes the figure
      // meaningful. Stored numbers are running totals, so a week compared
      // against older posts without matching their age would report how long ago
      // something went out as how well it did.
      detail:
        `Measured ${normal.ageDays} days after each post went out, against your ` +
        `last ${normal.basedOnPosts} ${label} posts.`,
    }
  }

  switch (normal.reason) {
    case 'no-history':
      return {
        direction: null,
        headline: `${label}: no normal to compare against yet.`,
        detail: 'Sahoda has stored no readings for this channel, so it has nothing to weigh.',
      }
    case 'too-few-prior-posts':
      return {
        direction: null,
        headline: `${label}: your normal is still being built.`,
        detail: `Three earlier ${label} posts have to reach the same age before Sahoda can say what usual looks like for you.`,
      }
    case 'week-too-young':
      return {
        direction: null,
        headline: `${label}: too soon to compare this week.`,
        detail:
          'These posts have not been out long enough to be measured against your older ones at the same age.',
      }
    case 'numbers-too-small':
      return {
        direction: null,
        headline: `${label}: your usual figures are too small to turn into a percentage.`,
        detail: 'A percentage of a very small number moves whenever one person opens a post.',
      }
  }
}

/** What the ranking is, and the one fact that makes it fair. */
export function rankingCaption(ranked: NonNullable<WeekReport['ranked']>): string {
  return `Both measured ${ranked.ageDays} days after they went out, across ${ranked.of} posts.`
}

/**
 * Why nothing changed, when nothing did.
 *
 * Returns null for a reason this build does not recognise, which is what a cycle
 * written before the reason was stored carries. A sentence invented for an
 * unknown value would be a claim with no query behind it.
 */
export function nothingChangedCopy(reason: string | null): string | null {
  switch (reason) {
    case 'no_history':
      return 'Sahoda changed nothing, because no post of yours had been measured yet.'
    case 'too_few_posts':
      return 'Sahoda read your numbers and left next week alone. Too few posts have been measured for a change to be worth making.'
    case 'single_group':
      return 'Sahoda read your numbers and left next week alone. Everything measured so far sits in one group, so there was nothing to compare.'
    case 'too_few_days':
      return 'Sahoda read your numbers and left next week alone. Everything measured falls inside a couple of days, which is too short to act on.'
    case 'numbers_too_small':
      return 'Sahoda read your numbers and left next week alone. The figures are still small enough that the difference could be one person.'
    case 'difference_too_small':
      return 'Sahoda compared your posts and found them close enough that changing next week was not worth it.'
    default:
      return null
  }
}
