import {
  getEntitlements,
  type DowngradeImpact,
  type OverLimitDimension,
  type PlanId,
} from '@sahoda/shared'

/**
 * What a plan change means for a workspace that is already over the new plan's limits.
 *
 * ── THE DESIGN DECISION, STATED ONCE ─────────────────────────────────────────
 * **Nothing is deleted.** A customer who drops from Growth to Starter with five connected
 * channels keeps all five. What changes is that they cannot connect a sixth — the limit
 * binds NEW creates, which is exactly what `checkEntitlement` already enforces at every
 * call site. Disconnecting a channel because a payment lapsed would destroy the customer's
 * work in response to a billing event, and there is no version of that which is a design
 * option. The contract carries `nothingIsDeleted: true` as a literal so the guarantee sits
 * in the type rather than in this comment.
 *
 * ── WHERE THE NUMBERS COME FROM ──────────────────────────────────────────────
 * `usage` is COUNTED by the caller, from the database, in the same read that renders the
 * screen. This function does not estimate, does not cache, and has no fallback: a sentence
 * telling a customer "you have 5 of 3 channels" is a claim about their own business, and
 * that is the one class of number this product may never invent. A caller that cannot
 * count must not call this — it must say it could not read the count.
 */

/** The countable dimensions. `loopLevel` and `twinSize` are capabilities, not counts. */
export const COUNTABLE_DIMENSIONS = ['channels', 'sites', 'seats'] as const
export type CountableDimension = (typeof COUNTABLE_DIMENSIONS)[number]

/** Live counts, read from the database. Every one is required — a missing count is not a zero. */
export type WorkspaceUsage = Record<CountableDimension, number>

export interface DowngradeImpactInput {
  toPlanId: PlanId
  /** When the new limits start applying. For a scheduled downgrade, the period end. */
  effectiveAt: Date
  usage: WorkspaceUsage
}

export function downgradeImpact(input: DowngradeImpactInput): DowngradeImpact {
  const limits = getEntitlements(input.toPlanId)

  const over: OverLimitDimension[] = COUNTABLE_DIMENSIONS.filter(
    (dimension) => input.usage[dimension] > limits[dimension],
  ).map((dimension) => ({
    dimension,
    have: input.usage[dimension],
    allowed: limits[dimension],
  }))

  return {
    toPlanId: input.toPlanId,
    effectiveAt: input.effectiveAt.toISOString(),
    over,
    nothingIsDeleted: true,
    blocksNewCreates: over.length > 0,
  }
}

/**
 * A sentence naming exactly what is over, derived from the counts rather than written.
 *
 * Returns `null` when nothing is over — so the caller renders no banner at all, rather
 * than a reassuring one. An empty state that says "you are within your limits" is
 * furniture on every screen it appears on.
 */
export function overLimitSentence(impact: DowngradeImpact): string | null {
  if (impact.over.length === 0) return null
  const parts = impact.over.map((o) => `${o.have} of ${o.allowed} ${o.dimension}`)
  const list =
    parts.length === 1
      ? (parts[0] as string)
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return (
    `You have ${list}. Nothing is removed — you keep what you have built, ` +
    `and you can add more once you are back under the limit.`
  )
}
