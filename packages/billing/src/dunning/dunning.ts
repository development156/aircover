import type { DunningPolicy, DunningStage, PlanId, SubscriptionView } from '@sahoda/shared'

/**
 * The dunning sequence: what happens between a payment failing and an account closing.
 *
 * ── THE ONE RULE ─────────────────────────────────────────────────────────────
 * **Credits already granted are the customer's property.** They were paid for, and the
 * ledger is append-only, so nothing in this file removes them. `existingCreditsSpendable`
 * is a literal `true` in the contract for that reason — a future change cannot switch it
 * off by flipping a flag, only by editing a type somebody has to read.
 *
 * What lapses instead is the ENTITLEMENT: the channel, site and seat allowances a plan
 * buys. Those are a subscription rather than a good, so they stop when the subscription
 * does. A suspended workspace keeps every credit it holds and drops to Free's limits.
 *
 * ── AND THE OTHER ONE ────────────────────────────────────────────────────────
 * Nothing here deletes anything. A workspace over Free's channel limit after suspension
 * keeps all of its channels; it simply cannot add another. See `downgradeImpact`.
 */

/** Hours after the failure at which each automatic retry is due. */
export const RETRY_OFFSETS_HOURS: readonly number[] = Object.freeze([24, 72, 168])

/** How long after the first failure the account keeps its plan. */
export const GRACE_DAYS = 7

/** How long a suspended subscription waits before it is closed. */
export const SUSPENDED_DAYS_BEFORE_CANCEL = 30

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Statuses that mean the plan's entitlements still apply. */
const ENTITLED_STAGES: ReadonlySet<DunningStage> = new Set(['current', 'past_due', 'grace'])

/** `subscriptions.status` → the dunning stage. `trialing` and `active` are both "current". */
export function stageForStatus(status: SubscriptionView['status']): DunningStage {
  switch (status) {
    case 'trialing':
    case 'active':
      return 'current'
    case 'past_due':
      return 'past_due'
    case 'grace':
      return 'grace'
    case 'suspended':
      return 'suspended'
    case 'canceled':
      return 'canceled'
  }
}

/**
 * When the next automatic retry is due, or null when the schedule is exhausted.
 *
 * Offsets are measured from the FIRST failure, not from the previous attempt, so a retry
 * that is itself delayed cannot push the whole sequence back indefinitely. `attemptsMade`
 * indexes the schedule directly: 0 attempts → the 24h slot, 3 attempts → nothing left.
 */
export function nextRetryAt(firstFailureAt: Date | null, attemptsMade: number): Date | null {
  if (!firstFailureAt) return null
  const offset = RETRY_OFFSETS_HOURS[attemptsMade]
  if (offset === undefined) return null
  return new Date(firstFailureAt.getTime() + offset * HOUR_MS)
}

/** Grace runs for a fixed window from the first failure. */
export function graceEndsAt(firstFailureAt: Date): Date {
  return new Date(firstFailureAt.getTime() + GRACE_DAYS * DAY_MS)
}

/**
 * The stage a subscription SHOULD be in right now, given the clock.
 *
 * Separate from `stageForStatus` on purpose: one reads what the database says, the other
 * says what a sweeper should write. Comparing them is how the sweeper knows there is work
 * to do, and keeping them apart means a stalled sweeper shows up as a disagreement rather
 * than as a silently correct-looking status.
 *
 * A subscription that is `current` stays `current` — this function never *starts* dunning.
 * That transition belongs to a failed payment event, which is a fact from the provider,
 * not something a clock can infer.
 */
export function advanceStage(view: SubscriptionView, now: Date): DunningStage {
  const stage = stageForStatus(view.status)
  if (stage === 'current' || stage === 'canceled') return stage

  const grace = view.graceEndsAt ? new Date(view.graceEndsAt) : null

  if (stage === 'past_due' || stage === 'grace') {
    // Without a recorded grace window there is nothing to expire against. Hold the stage
    // rather than guessing one: suspending an account on a missing timestamp would take a
    // customer's entitlements away because of OUR missing data.
    if (!grace) return stage
    return now.getTime() >= grace.getTime() ? 'suspended' : 'grace'
  }

  // suspended → canceled, a fixed window after grace ended.
  if (!grace) return 'suspended'
  const closesAt = grace.getTime() + SUSPENDED_DAYS_BEFORE_CANCEL * DAY_MS
  return now.getTime() >= closesAt ? 'canceled' : 'suspended'
}

/** Everything the app needs to decide what a workspace in dunning may do. */
export function dunningPolicy(view: SubscriptionView, now: Date): DunningPolicy {
  const stage = advanceStage(view, now)
  const entitled = ENTITLED_STAGES.has(stage)
  const firstFailureAt = view.lastFailureAt ? new Date(view.lastFailureAt) : null
  const retry = stage === 'past_due' || stage === 'grace'
  const grace = view.graceEndsAt ? new Date(view.graceEndsAt) : null

  return {
    stage,
    // Free is the floor, never a lower one: there is no plan below it and no state in
    // which a paying customer's workspace becomes unusable rather than merely limited.
    effectivePlanId: (entitled ? view.planId : 'free') satisfies PlanId,
    // The monthly grant is the thing a payment buys, so it stops the moment one is missed.
    monthlyGrantRuns: stage === 'current',
    existingCreditsSpendable: true,
    stageEndsAt: stageEndsAt(stage, grace),
    attemptsMade: view.dunningAttempts,
    nextRetryAt: retry
      ? (nextRetryAt(firstFailureAt, view.dunningAttempts)?.toISOString() ?? null)
      : null,
  }
}

/**
 * When the current stage runs out.
 *
 * `null` where there is genuinely no deadline — a current subscription, a closed one, or a
 * dunning window we have no timestamp for. Deliberately null rather than a guessed date:
 * §4 of the design system, a slot with no value renders as absent, and a date invented
 * here would be shown to a customer as the day their account changes.
 */
function stageEndsAt(stage: DunningStage, grace: Date | null): string | null {
  if (stage === 'past_due' || stage === 'grace') return grace?.toISOString() ?? null
  if (stage === 'suspended' && grace) {
    return new Date(grace.getTime() + SUSPENDED_DAYS_BEFORE_CANCEL * DAY_MS).toISOString()
  }
  return null
}
