import { LIVE_SUBSCRIPTION_STATUSES } from '@sahoda/billing'
import { PLAN_CATALOG, type PlanId, type SubscriptionView } from '@sahoda/shared'

import type { SettledRead } from './read'

/**
 * SHOULD SAHODA PUT THE PLANS IN FRONT OF THIS ACCOUNT?
 *
 * Pure, so every arm below is executed by a test rather than only by a browser
 * on a Tuesday. The page hands it the subscription read and does what it says.
 *
 * ── THE ONE RULE THIS FILE EXISTS TO HOLD ────────────────────────────────────
 * The offer is decided by the ACCOUNT'S REAL STATE and by nothing else. Not a
 * flag, not a date, not "new-looking". `readSubscription` is the same read the
 * plan screen uses, so the modal and /settings/plan can never disagree about
 * what plan somebody is on.
 *
 * ── WHY A STATUS CHECK AND NOT `planId === 'free'` ───────────────────────────
 * `readSubscription` returns the NEWEST row for the workspace whatever its
 * status — its own comment says so, because a workspace that cancelled and
 * resubscribed has several rows and `.maybeSingle()` would read as permanently
 * unreadable. So a customer who cancelled Growth last month comes back as
 * `planId: 'growth', status: 'canceled'`, and a plain `planId === 'free'` test
 * would decide they have a plan and stay silent forever.
 *
 * The live set is IMPORTED from the entitlement resolver
 * (`packages/billing/src/entitlements/pg.ts`), not restated. It was restated
 * first, with a comment claiming a test in this file pinned the two together;
 * an adversarial review found the test typed the four names by hand and
 * imported nothing, so a fifth status added on the enforcement side would have
 * left the two answers disagreeing for ever with nothing to report it. One
 * module decides which features a customer is served; this one decides whether
 * to sell them a plan, and they must not be able to disagree about who is on
 * one.
 *
 * ── ONE DIVERGENCE REMAINS, AND IT IS NOT FIXED HERE ─────────────────────────
 * `pg.ts` FILTERS on the live set. `readSubscription` takes the NEWEST row by
 * `created_at` and this function then asks whether that row is live. Those
 * agree except for one shape: a workspace holding a live row AND a
 * later-created closed one. `subscriptions_one_live` bounds the live rows to
 * one but leaves closed rows unbounded, so that shape is possible, and in it
 * `pg.ts` serves the plan while this offers to sell one. Fixing it means
 * changing what `readSubscription` selects, which is the plan screen's read as
 * well as this one. LATENT rather than live: nothing in production writes a
 * `subscriptions` row today.
 *
 * ── AND WHY A FAILED READ IS SILENCE, NOT AN OFFER ───────────────────────────
 * `unreadable` means we do not know. Guessing "probably free" puts a pricing
 * wall in front of a paying customer because a query failed, which is the worse
 * of the two errors by a distance. Missing an offer costs nothing anybody can
 * see. (`readSubscription` returns `SettledRead`, so the fourth arm —
 * `unavailable`, the lifecycle migration not being applied — cannot reach here:
 * the plan and status columns have existed since the first migration.)
 */
const LIVE_STATUSES: ReadonlySet<SubscriptionView['status']> = new Set(LIVE_SUBSCRIPTION_STATUSES)

export type PlanOfferDecision =
  | { kind: 'offer' }
  /** Named, never a bare `false`. A reason nobody can read is a reason nobody can check. */
  | {
      kind: 'silent'
      because: 'has-plan' | 'no-workspace' | 'unknown' | 'not-started' | 'credits-remain'
    }

export interface PlanOfferContext {
  /**
   * Whether the workspace has done anything yet — the same `workspaceHasStarted`
   * verdict that decides between the empty dashboard and the full one.
   *
   * MEASURED 2026-09-05 in a real browser: a workspace that had just finished
   * onboarding met this dialog before it had seen its own dashboard. Founder's
   * ruling the same day: the offer waits for the first action. The rule lives
   * here rather than in the page's JSX so that every mount site inherits it.
   */
  hasStarted: boolean
  /**
   * Credits the workspace can still spend, or `null` when the balance could
   * not be read. `null` is silence, not an offer: not knowing the balance is
   * not the same as knowing it is low.
   */
  creditsAvailable: number | null
}

/**
 * ── THE SIGNAL: HALF THE FREE GRANT IS GONE ──────────────────────────────────
 * MEASURED 2026-09-06 on the wt-core preview: "has done something" was true
 * after ONE saved draft, and the dialog covered the first real dashboard a
 * workspace ever saw with 100 of 100 credits unspent. A price list is an answer
 * to a question nobody has asked until the free credits are running out. The
 * founder delegated the choice of signal; this is it, read from the same
 * catalog the plans themselves come from so the threshold moves with the grant.
 */
export const OFFER_AT_OR_BELOW = Math.floor(PLAN_CATALOG.free.monthlyCredits / 2)

/**
 * The plan a workspace is really being served on, or `null` when the row is
 * closed and nothing is serving it. Exported because the modal states which
 * plan somebody is on, and it must not compute that a second way.
 */
export function livePlanId(view: SubscriptionView): PlanId | null {
  return LIVE_STATUSES.has(view.status) ? view.planId : null
}

export function planOfferDecision(
  read: SettledRead<SubscriptionView>,
  context: PlanOfferContext = { hasStarted: true, creditsAvailable: null },
): PlanOfferDecision {
  if (read.status === 'no-workspace') return { kind: 'silent', because: 'no-workspace' }
  if (read.status === 'unreadable') return { kind: 'silent', because: 'unknown' }
  if (!context.hasStarted) return { kind: 'silent', because: 'not-started' }
  if (context.creditsAvailable === null) return { kind: 'silent', because: 'unknown' }
  if (context.creditsAvailable > OFFER_AT_OR_BELOW) {
    return { kind: 'silent', because: 'credits-remain' }
  }

  const live = livePlanId(read.data)
  // `free` is a live plan in the schema — a workspace with no row reads as
  // `free`/`active` — and it is precisely the state this offer is for.
  if (live !== null && live !== 'free') return { kind: 'silent', because: 'has-plan' }
  return { kind: 'offer' }
}
