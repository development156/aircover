import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG, ProrationSchema } from '@sahoda/shared'
import { computeProration, planChangeKind, unusedBasisPoints } from './proration'

const AUG = {
  start: new Date('2026-08-01T00:00:00.000Z'),
  end: new Date('2026-09-01T00:00:00.000Z'),
}
/** Exactly half of a 31-day August. */
const MID_AUG = new Date('2026-08-16T12:00:00.000Z')

const prorate = (over: Partial<Parameters<typeof computeProration>[0]> = {}) =>
  computeProration({
    fromPlanId: 'starter',
    toPlanId: 'growth',
    periodStart: AUG.start,
    periodEnd: AUG.end,
    now: MID_AUG,
    currentPeriodPaid: true,
    ...over,
  })

describe('planChangeKind', () => {
  it('is decided by price, so the catalog cannot be reordered into a different answer', () => {
    expect(planChangeKind('starter', 'growth')).toBe('upgrade')
    expect(planChangeKind('growth', 'starter')).toBe('downgrade')
    expect(planChangeKind('growth', 'growth')).toBe('same')
    expect(planChangeKind('free', 'starter')).toBe('upgrade')
  })
})

describe('unusedBasisPoints', () => {
  it('is clamped at both ends, so a drifted clock cannot invert a charge', () => {
    expect(unusedBasisPoints(AUG.start, AUG.end, new Date('2026-07-01T00:00:00Z'))).toBe(10_000)
    expect(unusedBasisPoints(AUG.start, AUG.end, AUG.start)).toBe(10_000)
    expect(unusedBasisPoints(AUG.start, AUG.end, AUG.end)).toBe(0)
    expect(unusedBasisPoints(AUG.start, AUG.end, new Date('2026-10-01T00:00:00Z'))).toBe(0)
  })

  it('halfway through the period is half the period', () => {
    expect(unusedBasisPoints(AUG.start, AUG.end, MID_AUG)).toBe(5_000)
  })

  it('an inverted or zero-length period yields nothing rather than a negative multiplier', () => {
    expect(unusedBasisPoints(AUG.end, AUG.start, MID_AUG)).toBe(0)
    expect(unusedBasisPoints(AUG.start, AUG.start, AUG.start)).toBe(0)
  })
})

describe('computeProration — upgrading', () => {
  it('halfway through the month, Starter → Growth costs half the difference', () => {
    const p = prorate()
    // ₹1499 for half a month, less ₹499 already paid for half a month.
    expect(p).toMatchObject({
      kind: 'upgrade',
      immediate: true,
      unusedBasisPoints: 5_000,
      remainderChargePaise: 74_950,
      unusedCreditPaise: 24_950,
      amountDuePaise: 50_000,
      creditsGranted: 1_750,
    })
    expect(ProrationSchema.parse(p)).toEqual(p)
  })

  it('every rounding goes the customer’s way — proved on an amount where they differ', () => {
    // 23 of 31 days left → 7419bp. Both figures are fractional at this point, and they are
    // rounded in OPPOSITE directions: the charge down, the set-off up.
    const now = new Date('2026-08-09T00:00:00.000Z')
    const bp = unusedBasisPoints(AUG.start, AUG.end, now)
    expect(bp).toBe(7_419)

    const exactCharge = (PLAN_CATALOG.growth.priceInr * 100 * bp) / 10_000
    const exactCredit = (PLAN_CATALOG.starter.priceInr * 100 * bp) / 10_000
    expect(Number.isInteger(exactCharge)).toBe(false)
    expect(Number.isInteger(exactCredit)).toBe(false)

    const p = prorate({ now })
    expect(p.remainderChargePaise).toBe(Math.floor(exactCharge))
    expect(p.unusedCreditPaise).toBe(Math.ceil(exactCredit))
    // Stated as the outcome, not just the mechanism: the customer is charged less than the
    // exact figure and credited more than it.
    expect(p.remainderChargePaise).toBeLessThan(exactCharge)
    expect(p.unusedCreditPaise).toBeGreaterThan(exactCredit)
  })

  it('an unpaid period has no unused value to set off — the full remainder is due', () => {
    // A workspace in dunning received the period's entitlements without paying. Crediting
    // it the old plan's unused value would hand over the price difference for nothing.
    const paid = prorate({ currentPeriodPaid: true })
    const unpaid = prorate({ currentPeriodPaid: false })
    expect(unpaid.unusedCreditPaise).toBe(0)
    expect(unpaid.amountDuePaise).toBe(unpaid.remainderChargePaise)
    expect(unpaid.amountDuePaise).toBeGreaterThan(paid.amountDuePaise)
  })

  it('upgrading from Free grants the whole new allotment, not the allotment minus 100', () => {
    // free.monthlyCredits is 100 in the catalog, but nothing grants it monthly — the free
    // credits are a one-time signup grant. Deducting them here would short every first
    // purchase by 100 credits against a page that promised 1500.
    const p = prorate({ fromPlanId: 'free', toPlanId: 'starter', now: AUG.start })
    expect(PLAN_CATALOG.free.monthlyCredits).toBe(100)
    expect(p.creditsGranted).toBe(PLAN_CATALOG.starter.monthlyCredits)
    expect(p.unusedCreditPaise).toBe(0)
    expect(p.amountDuePaise).toBe(PLAN_CATALOG.starter.priceInr * 100)
  })

  it('upgrading on the last minute of the period charges nothing and grants a token credit', () => {
    const p = prorate({ now: new Date('2026-08-31T23:59:00.000Z') })
    expect(p.immediate).toBe(true)
    expect(p.amountDuePaise).toBe(0)
    expect(p.creditsGranted).toBeGreaterThanOrEqual(0)
  })
})

describe('computeProration — downgrading', () => {
  it('never takes effect immediately, and never charges or grants anything', () => {
    const p = prorate({ fromPlanId: 'growth', toPlanId: 'starter' })
    expect(p).toMatchObject({
      kind: 'downgrade',
      immediate: false,
      effectiveAt: AUG.end.toISOString(),
      remainderChargePaise: 0,
      unusedCreditPaise: 0,
      amountDuePaise: 0,
      creditsGranted: 0,
    })
  })

  it('a change to the same plan is a no-op, not a free upgrade', () => {
    const p = prorate({ fromPlanId: 'growth', toPlanId: 'growth' })
    expect(p.kind).toBe('same')
    expect(p.immediate).toBe(false)
    expect(p.amountDuePaise).toBe(0)
  })
})

describe('computeProration — the properties that must hold for every pair and every instant', () => {
  const PLAN_IDS = Object.keys(PLAN_CATALOG) as (keyof typeof PLAN_CATALOG)[]

  it('never produces a negative charge, a negative credit, or a credit debit', () => {
    const failures: string[] = []
    for (const fromPlanId of PLAN_IDS) {
      for (const toPlanId of PLAN_IDS) {
        for (const paid of [true, false]) {
          for (let day = -2; day <= 33; day += 1) {
            const now = new Date(AUG.start.getTime() + day * 86_400_000)
            const p = computeProration({
              fromPlanId,
              toPlanId,
              periodStart: AUG.start,
              periodEnd: AUG.end,
              now,
              currentPeriodPaid: paid,
            })
            const parsed = ProrationSchema.safeParse(p)
            if (!parsed.success) failures.push(`${fromPlanId}->${toPlanId} d${day}: schema`)
            if (p.amountDuePaise < 0)
              failures.push(`${fromPlanId}->${toPlanId} d${day}: negative due`)
            if (p.creditsGranted < 0)
              failures.push(`${fromPlanId}->${toPlanId} d${day}: negative credits`)
            // A downgrade may never grant credits or take money.
            if (p.kind !== 'upgrade' && (p.creditsGranted > 0 || p.amountDuePaise > 0)) {
              failures.push(`${fromPlanId}->${toPlanId} d${day}: non-upgrade moved money`)
            }
          }
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([])
  })

  it('an upgrade never costs more than the new plan’s full monthly price', () => {
    const failures: string[] = []
    for (const fromPlanId of PLAN_IDS) {
      for (const toPlanId of PLAN_IDS) {
        for (let day = 0; day <= 31; day += 1) {
          const p = computeProration({
            fromPlanId,
            toPlanId,
            periodStart: AUG.start,
            periodEnd: AUG.end,
            now: new Date(AUG.start.getTime() + day * 86_400_000),
            currentPeriodPaid: true,
          })
          if (p.amountDuePaise > PLAN_CATALOG[toPlanId].priceInr * 100) {
            failures.push(`${fromPlanId}->${toPlanId} d${day}: ${p.amountDuePaise}`)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })
})
