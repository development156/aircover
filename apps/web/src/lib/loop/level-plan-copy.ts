import {
  AUTONOMY_LEVELS,
  cheapestPlanWithAtLeast,
  PLAN_CATALOG,
  type AutonomyLevel,
  type PlanId,
} from '@sahoda/shared'

/**
 * The sentence a person reads when their plan does not reach a rung of the
 * dial, built from `PLAN_CATALOG` and `AUTONOMY_LEVELS` rather than written.
 *
 * `lib/billing/limit-copy.ts` does this for the COUNTABLE dimensions and says
 * why one function serves both the pre-click notice and the refusal: two
 * sentences cannot disagree when there is only one. `loopLevel` is a MAX LEVEL,
 * not a count, so "you're using 2 of 3" would be nonsense here; the sentence
 * names the rung, the plan that reaches it, and how far the current plan goes.
 *
 * No charge claim is made. Setting the dial costs nothing, so "you were not
 * charged" would be true and beside the point.
 */

/** The rung that every plan in the catalog reaches; below it no gate is needed. */
export const LEVEL_EVERY_PLAN_ALLOWS: AutonomyLevel = Object.values(PLAN_CATALOG)
  .map((plan) => plan.limits.loopLevel)
  .reduce((min, level) => (level < min ? level : min), 3) as AutonomyLevel

function rungName(level: number): string {
  return AUTONOMY_LEVELS.find((l) => l.level === level)?.name ?? `level ${level}`
}

export interface LevelPlanCopyInput {
  /** The rung the person asked for. */
  level: AutonomyLevel
  planId: PlanId
  /** The highest rung the plan reaches. */
  limit: number
}

export function levelPlanSentence(input: LevelPlanCopyInput): string {
  const { level, planId, limit } = input
  const planName = PLAN_CATALOG[planId].name
  const wanted = rungName(level)
  const upgrade = cheapestPlanWithAtLeast('loopLevel', level)
  const reach = `Your ${planName} plan goes up to ${rungName(limit)}.`
  // Already on the largest plan that exists: say so rather than inventing an upsell.
  if (!upgrade) return `${wanted} is not part of any plan yet. ${reach}`
  return `${wanted} is on ${upgrade.name} and above. ${reach}`
}
