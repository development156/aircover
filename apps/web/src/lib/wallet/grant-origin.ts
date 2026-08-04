import { PlanIdSchema, type LedgerEntry } from '@sahoda/shared'

import { correctionMeta } from './correction'

/**
 * Where a GRANT came from — restricted to what can be PROVEN about it.
 *
 * The wallet used to decide this from `action_type`: `signup_grant` meant
 * welcome credits, and everything else fell back to "Plan credits · Included
 * with your plan." Both halves are wrong on real data. `credit_ledger` seq 5374
 * is an engineer's manual top-up written during a verification run, carrying
 * `action_type: 'signup_grant'` — so the account owner was told those credits
 * came free with their signup. And the fallback claimed a plan for every other
 * GRANT, including ones written by hand, by an admin, or by a correction.
 *
 * `action_type` is free text with no CHECK constraint, so it cannot carry this
 * weight. `idempotency_key` can. It is UNIQUE across the ledger and each of the
 * two automated writers builds it to a fixed shape:
 *
 *   bootstrap_workspace → `grant:signup:<workspace_id>`      (signupGrantKey)
 *   applyPlanGrant      → `grant:<plan>:<period>:<workspace>` (monthlyGrantKey)
 *
 * so a row matching one is that writer's row, and nothing forges one by
 * accident. Neither the key nor the actor is ever rendered — they are read here
 * to CLASSIFY, and the copy the user sees comes from the classification.
 *
 * The rule this module exists to enforce: assert the plan only with proof, and
 * fall back to a weaker true statement — never to the strongest claim.
 */

export type GrantOrigin = 'signup' | 'plan' | 'correction' | 'manual' | 'unknown'

/** `monthlyGrantKey` stamps the billing period as `YYYY-MM` (`currentBillingPeriod`). */
const BILLING_PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/

const PLAN_IDS: ReadonlySet<string> = new Set<string>(PlanIdSchema.options)

/**
 * Does this key prove `applyPlanGrant` wrote the row for THIS workspace?
 *
 * Split on ':' and matched whole rather than by prefix: a key that merely
 * begins `grant:starter:2026-07:<ws>` and continues is a different key written
 * by something else, and must not inherit the plan claim.
 */
function isPlanGrantKey(key: string, workspaceId: string): boolean {
  const parts = key.split(':')

  return (
    parts.length === 4 &&
    parts[0] === 'grant' &&
    PLAN_IDS.has(parts[1] ?? '') &&
    BILLING_PERIOD.test(parts[2] ?? '') &&
    parts[3] === workspaceId
  )
}

/**
 * Classify a GRANT row.
 *
 * Order matters and is deliberate:
 *
 *  1. A correction wins outright. A row that exists only because an earlier one
 *     was wrong is best explained as that, whatever its key looks like.
 *  2. Signup before plan: `bootstrap_workspace` records the new user as the
 *     actor, so a signup grant would otherwise read as "manual".
 *  3. Plan needs BOTH the key and the provider actor `applyPlanGrant` writes.
 *     Anything hand-writing a plan-shaped key is not the billing webhook, and
 *     losing the claim on half a match is the safe direction to be wrong in.
 *  4. An actor recorded and nothing else known → manual: only service-role
 *     callers can write the ledger at all, so someone at Sahoda did this.
 *  5. Otherwise unknown, and the copy claims nothing.
 */
export function grantOrigin(entry: LedgerEntry): GrantOrigin {
  if (correctionMeta(entry) !== null) return 'correction'

  const key = entry.idempotency_key

  if (key === `grant:signup:${entry.workspace_id}`) return 'signup'

  if (isPlanGrantKey(key, entry.workspace_id) && entry.actor?.startsWith('provider:') === true) {
    return 'plan'
  }

  const actor = entry.actor?.trim() ?? ''

  // No split between a person and an internal job here, deliberately: a job
  // that adds credits was written and deployed on purpose, so both are Sahoda
  // putting credits in by hand as far as the account owner is concerned. What
  // neither is, is a plan grant — and that is the distinction that was lying.
  return actor === '' ? 'unknown' : 'manual'
}
