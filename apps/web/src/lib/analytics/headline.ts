/**
 * THE FOUR NUMBERS AT THE TOP, AND WHAT EACH OF THEM IS ACTUALLY A NUMBER OF.
 *
 * ── THE BRIEF ASKED FOR FOUR AND THIS PRODUCT CAN MEASURE TWO ────────────────
 * Written down here rather than discovered later, because the gap is the most
 * important thing on the screen:
 *
 *   People reached      the platforms report this for the ACCOUNT over a window.
 *                       Per-post reach is a running lifetime total, so posts in a
 *                       window cannot be summed and compared with the window
 *                       before it — the newer posts are simply younger. Instagram
 *                       only; no other platform has an account read.
 *   People who replied  NOT MEASURED ANYWHERE. `engagement` sums likes, comments,
 *                       shares and saves and throws the parts away, so there is
 *                       no comment count in this product at any granularity, and
 *                       none can be back-filled: platforms report only current
 *                       numbers. The card states that rather than showing
 *                       `engagement` under a label that would be false.
 *   Enquiries           real, from the leads table, counted in the window.
 *   Posts published     real, from the publish log, counted as distinct posts.
 *
 * A card with nothing to show still renders. Hiding it would leave the reader to
 * work out whether the number is zero, missing, or a feature that does not
 * exist — three different facts, and only one of them is about their business.
 *
 * Pure: no I/O, no clock, no React.
 */

/** Prior weeks of history before a baseline comparison is offered at all. */
export const MIN_BASELINE_WEEKS = 3

export type MetricId = 'reached' | 'replied' | 'enquiries' | 'published'

/** Why a number is absent. Each is a different sentence to the reader. */
export type HeadlineAbsence =
  /** This product does not measure this at all. Not a fault, not a wait. */
  | 'not-measured'
  /** Nothing is connected that could report it. */
  | 'not-connected'
  /** We asked and the answer did not arrive. Only this one earns a retry. */
  | 'unreadable'
  /** Connected and reporting, but nothing has come back for this window yet. */
  | 'waiting'

/** How this window compares with the one before it, or why it does not. */
export type Change =
  | { kind: 'compared'; direction: 'up' | 'down' | 'level'; percent: number; previous: number }
  /** Under three weeks of history. A percentage here would mislead. */
  | { kind: 'learning' }
  /** The previous window has no reading, so there is nothing to compare with. */
  | { kind: 'no-previous' }
  /**
   * The previous window WAS measured and the answer was none.
   *
   * Kept apart from `no-previous` because they are opposite facts: one says we
   * did not look, the other says we looked and there was nothing. An audit found
   * this page telling a workspace that published four posts this month and none
   * last month "nothing measured in the period before" — which is the mirror of
   * the rule the rest of this product enforces everywhere.
   */
  | { kind: 'from-none' }
  /** Measured both times, and the answer was none both times. */
  | { kind: 'level-none' }

export interface Headline {
  id: MetricId
  /** Plain English, and the only words the reader sees. */
  label: string
  /** One sentence explaining the metric to somebody who has never used a tool. */
  meaning: string
  /** The reading, or null with `absence` saying which kind of nothing. */
  value: number | null
  absence?: HeadlineAbsence
  /** What the figure counts, in the reader's terms. Always rendered. */
  caveat: string
  change: Change
}

/** Below this the move is inside ordinary noise and is called level. */
export const MIN_MOVE = 0.1

/**
 * Compare a window against the one before it.
 *
 * `weeksOfHistory` gates the whole thing: under three weeks there is no normal
 * to be above or below, and a percentage computed from two weeks teaches the
 * reader that the percentage means something. `learning` is that refusal and it
 * is a state on the screen, not a hidden branch.
 */
export function changeFor(
  current: number | null,
  previous: number | null,
  weeksOfHistory: number,
): Change {
  if (weeksOfHistory < MIN_BASELINE_WEEKS) return { kind: 'learning' }
  if (current === null || previous === null) return { kind: 'no-previous' }
  // A zero previous window makes every ratio infinite. There is no percentage
  // to state, and "up infinity per cent" is not a sentence — but there IS
  // something true to say, and it is not "we did not measure".
  // ...and "up from none" is only true when this window has something. None
  // both times is not a rise; it is the same answer twice.
  if (previous <= 0) return current > 0 ? { kind: 'from-none' } : { kind: 'level-none' }

  const move = (current - previous) / previous
  return {
    kind: 'compared',
    direction: Math.abs(move) < MIN_MOVE ? 'level' : move > 0 ? 'up' : 'down',
    percent: Math.round(Math.abs(move) * 100),
    previous,
  }
}

/** The words for a change, so the two screens cannot phrase it differently. */
export function changeSentence(change: Change, windowLabel: string): string {
  switch (change.kind) {
    case 'learning':
      return 'Still learning your normal'
    case 'no-previous':
      return `Nothing measured in the ${windowLabel.toLowerCase()} before this`
    case 'from-none':
      return 'Up from none in the period before'
    case 'level-none':
      return 'None in this period, and none in the one before'
    case 'compared':
      if (change.direction === 'level') return 'About the same as the period before'
      return `${change.direction === 'up' ? 'Up' : 'Down'} ${change.percent}% on the period before`
  }
}

/** What a card says instead of a figure. Never "no data". */
export function absenceSentence(absence: HeadlineAbsence): string {
  switch (absence) {
    case 'not-measured':
      return 'Sahoda does not measure this yet'
    case 'not-connected':
      return 'No account connected that reports this'
    case 'unreadable':
      return 'Sahoda could not read this just now'
    case 'waiting':
      return 'Nothing reported for this period yet'
  }
}
