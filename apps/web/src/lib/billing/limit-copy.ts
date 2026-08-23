import { cheapestPlanWithAtLeast, PLAN_CATALOG, type PlanId, type PlanLimits } from '@sahoda/shared'

/**
 * Customer-facing copy for a plan limit — the SAME sentence before the click and
 * after a refusal, built from `PLAN_CATALOG` rather than written by hand.
 *
 * One function serves both moments on purpose. A pre-click notice that says one
 * thing and a refusal that says another is how a customer ends up believing the
 * limit moved; here they cannot disagree, because there is only one sentence.
 *
 * This returns the PLAN sentence only. Each call site appends its own consequence,
 * because the consequences are genuinely different: a refused site generation can
 * honestly say "you were not charged" (the gate runs before the credit hold), and a
 * refused channel connect has no charge to speak of at all. Baking a charge claim in
 * here would put a false one on the channel path.
 */

/** The countable dimensions apps/web actually gates on today. */
export type CountableDimension = Extract<keyof PlanLimits, 'sites' | 'channels' | 'seats'>

const NOUN: Record<CountableDimension, { one: string; many: string }> = {
  sites: { one: 'site', many: 'sites' },
  channels: { one: 'channel', many: 'channels' },
  seats: { one: 'seat', many: 'seats' },
}

const noun = (dimension: CountableDimension, count: number): string =>
  count === 1 ? NOUN[dimension].one : NOUN[dimension].many

export interface PlanLimitCopyInput {
  dimension: CountableDimension
  planId: PlanId
  /** The plan's allowance for this dimension. */
  limit: number
  /** How many already exist. */
  currentUsage: number
}

/**
 * The sentence. Two shapes, because "your plan has none of these" and "your plan
 * has some and they're used up" are different problems with different fixes.
 *
 * The upgrade target is looked up for `currentUsage + 1` — what it would take to
 * allow ONE MORE — never for the raw limit. Asking for the limit recommends the
 * plan they are already on.
 */
export function planLimitSentence(input: PlanLimitCopyInput): string {
  const { dimension, planId, limit, currentUsage } = input
  const planName = PLAN_CATALOG[planId].name
  const upgrade = cheapestPlanWithAtLeast(dimension, currentUsage + 1)

  // The plan grants none of this dimension at all (Free allows `sites: 0`).
  if (limit === 0) {
    const plural = NOUN[dimension].many
    if (!upgrade) return `${capitalize(plural)} aren't part of any plan yet.`
    return `${capitalize(plural)} are on ${upgrade.name} and above. Your ${planName} plan doesn't include one.`
  }

  const have = `Your ${planName} plan includes ${limit} ${noun(dimension, limit)} and you're using ${currentUsage}.`
  // Already on the largest plan that exists: say so rather than inventing an upsell.
  if (!upgrade) return have
  return `${have} ${upgrade.name} includes ${upgrade.limits[dimension]}.`
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)
