import type { Channel } from '@sahoda/shared'

import { AUTOPILOT_REFUSALS, type AutopilotRefusal } from '@/lib/loop/autopilot-refusals'
import { brainClearsAutopilotFloor } from '@/lib/brand/autopilot-floor'

/**
 * THE AUTOPILOT DISPATCHER, PHASE ONE — decide, and say why, before anything moves.
 *
 * ── WHY THIS FILE IS PURE ────────────────────────────────────────────────────
 * Everything here is arithmetic over values. No database, no clock of its own,
 * no publish call. That is deliberate: this is the code that decides to publish
 * in a customer's voice while nobody is watching, and the only version of it
 * worth trusting is one every branch can be forced from a test without a
 * network. The writing and the publishing live elsewhere and are dull by
 * comparison.
 *
 * ── THE LEVEL IS READ AS A NUMBER, AND THAT IS NOT SLOPPINESS ────────────────
 * `AutonomyLevelSchema` admits 0, 1 and 2. The database admits 3 under the two
 * preconditions in `20260828120000_loop_autopilot_l3.sql`. That asymmetry is the
 * safe direction and is on purpose: the dial cannot be turned to 3 through the
 * application, so a 3 in the column got there under the trigger's supervision.
 * This module has to be able to SEE that 3 — recognising it is its whole job —
 * so it takes the stored integer rather than the narrowed type. Widening the
 * shared schema instead would let a form post a 3 and skip the trigger's
 * argument about what it costs.
 *
 * ── THE ORDER OF THE GUARDRAILS IS AN ARGUMENT, NOT AN ACCIDENT ──────────────
 * Two guardrails can refuse the same post, and the row records ONE reason. The
 * rule is: NAME THE MOST PERMANENT ONE.
 *
 *   1 NOT_AUTOPILOT_CHANNEL  the channel was never armed, so this post was never
 *                            an autopilot candidate. Recording a safety refusal
 *                            against a post a person is going to read by hand at
 *                            L2 would be a false alarm in the audit trail.
 *   2 REFUSAL_GATE           a property of the post's own words. Fixing the cap
 *                            or the budget does not change it.
 *   3 CONSTRAINT_ENGINE      likewise: the post does not fit the channel.
 *   4 BRAIN_BELOW_FLOOR      workspace state. Persists until a person confirms
 *                            the four fields, but a person CAN clear it today.
 *   5 DAILY_CAP              expires at midnight.
 *   6 WEEKLY_BUDGET          expires at the end of the week.
 *
 * Ordering the quotas first would let a full day mask the fact that autopilot
 * tried to publish something that crosses a red line — and "did autopilot ever
 * attempt a post the gate refused" is exactly the question this log exists to
 * answer.
 */

/** One variant autopilot is considering. Everything it needs, already measured. */
export interface AutopilotCandidate {
  postId: string
  variantId: string
  channel: Channel
  /** The account this would publish to, as `assert_account_for_scheduled_post` spells it. */
  accountId: string
  briefId: string | null
  cycleId: string | null
  /** TRUE when the refusal gate flagged this body. */
  gateFlagged: boolean
  /** TRUE when the Constraint Engine says the post fits the channel. */
  fitsChannel: boolean
  /** Credits this publish will spend. */
  costCredits: number
}

/** The workspace as it stands this tick. One reading, shared by every candidate. */
export interface AutopilotWorld {
  now: Date
  /** The stored dial level for a channel. Absent means the customer never set one. */
  levelFor(channel: Channel): number | undefined
  /** The active `brand_memory` payload, or null when there is none. */
  brainPayload: unknown
  /** `loop_settings.autopilot_daily_cap`. */
  dailyCap: number
  /** How many posts autopilot has already published today. */
  publishedToday: number
  /** `loop_settings.autopilot_cancel_minutes`. */
  cancelMinutes: number
  /** Credits left in this week's budget. */
  weeklyBudgetRemaining: number
}

export type AutopilotDecision =
  | { kind: 'announce'; candidate: AutopilotCandidate; dispatchAfter: Date }
  | { kind: 'refuse'; candidate: AutopilotCandidate; reason: AutopilotRefusal }

/** The level at which Sahoda acts with nobody in the room. */
export const AUTOPILOT_LEVEL = 3

/**
 * The shortest cancel window this code will honour, matching the CHECK in
 * `20260828120000_loop_autopilot_l3.sql`.
 *
 * The clamp exists because this module takes the setting as a number rather
 * than re-reading the column's constraint. A zero that reached here — from a
 * fixture, a stale row written before the constraint, a caller that defaulted a
 * missing value to 0 — would announce a post and dispatch it in the same
 * instant, which is autopilot with no cancel wearing the costume of one.
 */
export const AUTOPILOT_CANCEL_FLOOR_MINUTES = 5

/**
 * When the window closes for a post announced now.
 *
 * Exported because the announcement row and the due-scan must agree on it, and
 * two computations of the same instant is how they stop agreeing.
 */
export function dispatchAfter(now: Date, cancelMinutes: number): Date {
  const minutes = Math.max(AUTOPILOT_CANCEL_FLOOR_MINUTES, Math.floor(cancelMinutes))
  return new Date(now.getTime() + minutes * 60_000)
}

/**
 * Decide one candidate against a world that does not move.
 *
 * Not exported for the batch's sake — the batch is what callers want, because a
 * cap only means anything across a batch. This is exported so a single decision
 * can be forced in a test without constructing a list.
 */
export function decideOne(candidate: AutopilotCandidate, world: AutopilotWorld): AutopilotDecision {
  const refuse = (reason: AutopilotRefusal): AutopilotDecision => ({
    kind: 'refuse',
    candidate,
    reason,
  })

  if (world.levelFor(candidate.channel) !== AUTOPILOT_LEVEL) {
    return refuse(AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL)
  }
  if (candidate.gateFlagged) return refuse(AUTOPILOT_REFUSALS.REFUSAL_GATE)
  if (!candidate.fitsChannel) return refuse(AUTOPILOT_REFUSALS.CONSTRAINT_ENGINE)
  if (!brainClearsAutopilotFloor(world.brainPayload)) {
    return refuse(AUTOPILOT_REFUSALS.BRAIN_BELOW_FLOOR)
  }
  if (world.publishedToday >= world.dailyCap) return refuse(AUTOPILOT_REFUSALS.DAILY_CAP)
  if (candidate.costCredits > world.weeklyBudgetRemaining) {
    return refuse(AUTOPILOT_REFUSALS.WEEKLY_BUDGET)
  }

  return {
    kind: 'announce',
    candidate,
    dispatchAfter: dispatchAfter(world.now, world.cancelMinutes),
  }
}

/**
 * Decide a whole tick's worth of candidates.
 *
 * ── WHY THE COUNTERS ARE THREADED AND NOT READ ONCE ──────────────────────────
 * A cap of 3 checked against a single reading of `publishedToday` lets ten
 * candidates all pass it: every one of them compares itself to the same zero.
 * The cap is only a cap if each announcement spends against the next one's
 * allowance, and the same is true of the week's credits. This is the defect the
 * batch exists to prevent, and both counters are asserted in the tests.
 *
 * An announcement is counted as spent even though nothing has published yet.
 * That is the cautious reading and it is the right one: between the
 * announcement and the dispatch the post is going out unless somebody stops it,
 * and a cap that only counts completed publishes would announce a day's worth
 * of posts every tick until the first of them landed.
 */
export function decideAutopilotBatch(
  candidates: readonly AutopilotCandidate[],
  world: AutopilotWorld,
): AutopilotDecision[] {
  let publishedToday = world.publishedToday
  let weeklyBudgetRemaining = world.weeklyBudgetRemaining

  return candidates.map((candidate) => {
    const decision = decideOne(candidate, {
      ...world,
      levelFor: world.levelFor,
      publishedToday,
      weeklyBudgetRemaining,
    })
    if (decision.kind === 'announce') {
      publishedToday += 1
      weeklyBudgetRemaining -= candidate.costCredits
    }
    return decision
  })
}
