import { PLAN_CATALOG, type PlanId, type Proration, type PlanChangeKind } from '@sahoda/shared'

/**
 * What a plan change costs and grants — computed before anything is charged.
 *
 * ── THE ASYMMETRY IS THE DESIGN ──────────────────────────────────────────────
 * An UPGRADE is immediate. A DOWNGRADE is not, ever. The reason is in the ledger, not in
 * commercial policy: credits already granted may already be spent, and a mid-period
 * downgrade would have to take back credits that are no longer there. MEASURED, under
 * PGlite, against the real `app.apply_ledger_entry`: a compensating entry larger than the
 * balance does not clamp — it aborts the whole transaction on `balance_held_le_total` and
 * writes NO ledger row at all. There is no version of an immediate downgrade that leaves
 * the ledger both honest and complete, so downgrades wait for the period boundary.
 *
 * ── EVERY ROUNDING GOES TO THE CUSTOMER, AND IT IS ONE LINE EACH ─────────────
 * The charge for the remaining part of the period is rounded DOWN; the unused value being
 * set against it is rounded UP; the credits granted are rounded UP. Three roundings, all
 * in the same direction, so the arithmetic can never quietly favour us by a paisa.
 *
 * ── INTEGER BASIS POINTS, NOT A FRACTION ─────────────────────────────────────
 * `remaining / total` as a float is then multiplied into money. Basis points keep the
 * whole calculation in integers, which is the same rule `computeTax` follows and for the
 * same reason.
 */

/** Basis points in a whole. */
const BP = 10_000

export interface ProrationInput {
  fromPlanId: PlanId
  toPlanId: PlanId
  /** Start of the billing period in force. */
  periodStart: Date
  /** End of the billing period in force. */
  periodEnd: Date
  now: Date
  /**
   * Whether the CURRENT period has actually been paid for.
   *
   * This is not a formality. A workspace that is past due has received the period's
   * entitlements without paying for them, so it has no unused value to set against an
   * upgrade — crediting it one would hand over the price difference for nothing. Callers
   * read this from the subscription's status, never assume it.
   */
  currentPeriodPaid: boolean
}

/** Which direction a change goes, by price. Ordering by price is what "upgrade" means here. */
export function planChangeKind(fromPlanId: PlanId, toPlanId: PlanId): PlanChangeKind {
  const from = PLAN_CATALOG[fromPlanId].priceInr
  const to = PLAN_CATALOG[toPlanId].priceInr
  if (to > from) return 'upgrade'
  if (to < from) return 'downgrade'
  return 'same'
}

/**
 * How much of the period is still ahead, in basis points.
 *
 * Clamped at both ends. A clock that has drifted past `periodEnd`, or a period that has
 * not started, must produce 0 or 10000 — never a negative multiplier that would turn a
 * charge into a credit.
 */
export function unusedBasisPoints(periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime()
  if (!Number.isFinite(total) || total <= 0) return 0
  const remaining = periodEnd.getTime() - now.getTime()
  if (remaining <= 0) return 0
  if (remaining >= total) return BP
  return Math.floor((remaining * BP) / total)
}

export function computeProration(input: ProrationInput): Proration {
  const { fromPlanId, toPlanId, periodStart, periodEnd, now, currentPeriodPaid } = input
  const kind = planChangeKind(fromPlanId, toPlanId)
  const from = PLAN_CATALOG[fromPlanId]
  const to = PLAN_CATALOG[toPlanId]

  // A downgrade, or a change to the same price, waits for the period boundary. Nothing is
  // charged and nothing is granted, so the arithmetic below would only produce noise.
  if (kind !== 'upgrade') {
    return {
      kind,
      fromPlanId,
      toPlanId,
      effectiveAt: periodEnd.toISOString(),
      immediate: false,
      unusedBasisPoints: unusedBasisPoints(periodStart, periodEnd, now),
      remainderChargePaise: 0,
      unusedCreditPaise: 0,
      amountDuePaise: 0,
      creditsGranted: 0,
    }
  }

  const bp = unusedBasisPoints(periodStart, periodEnd, now)

  // Rounded DOWN — the customer pays for no more of the period than is left.
  const remainderChargePaise = Math.floor((to.priceInr * 100 * bp) / BP)

  // Rounded UP — and only when the period was genuinely paid for.
  const unusedCreditPaise = currentPeriodPaid ? Math.ceil((from.priceInr * 100 * bp) / BP) : 0

  // Never negative. An upgrade whose set-off exceeds its charge is not a refund; the
  // customer simply pays nothing and keeps the better plan.
  const amountDuePaise = Math.max(0, remainderChargePaise - unusedCreditPaise)

  return {
    kind,
    fromPlanId,
    toPlanId,
    effectiveAt: now.toISOString(),
    immediate: true,
    unusedBasisPoints: bp,
    remainderChargePaise,
    unusedCreditPaise,
    amountDuePaise,
    creditsGranted: proratedCreditDifference(fromPlanId, toPlanId, bp),
  }
}

/**
 * The credits an upgrade grants: the DIFFERENCE between the plans' monthly allotments,
 * for the part of the period that is left, rounded up.
 *
 * ── WHY FREE IS A ZERO BASELINE AND NOT 100 ──────────────────────────────────
 * `PLAN_CATALOG.free.monthlyCredits` is 100, but nothing grants it monthly. Free credits
 * arrive exactly once, at bootstrap, keyed by `signupGrantKey` — VERIFIED: there is no
 * caller of `monthlyGrantKey` anywhere that grants for the free plan. Subtracting 100
 * from an upgrade would therefore deduct credits the customer was never given for this
 * period, and the first thing a new customer would notice about paying us is that they
 * got 100 fewer credits than the page promised.
 */
function proratedCreditDifference(fromPlanId: PlanId, toPlanId: PlanId, bp: number): number {
  const alreadyCovered = fromPlanId === 'free' ? 0 : PLAN_CATALOG[fromPlanId].monthlyCredits
  const difference = PLAN_CATALOG[toPlanId].monthlyCredits - alreadyCovered
  if (difference <= 0) return 0
  return Math.ceil((difference * bp) / BP)
}
