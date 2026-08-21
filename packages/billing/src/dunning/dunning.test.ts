import { describe, expect, it } from 'vitest'
import { DunningPolicySchema, type SubscriptionView } from '@sahoda/shared'
import {
  advanceStage,
  dunningPolicy,
  GRACE_DAYS,
  graceEndsAt,
  nextRetryAt,
  RETRY_OFFSETS_HOURS,
  stageForStatus,
  SUSPENDED_DAYS_BEFORE_CANCEL,
} from './dunning'

const FAILED_AT = new Date('2026-08-01T00:00:00.000Z')
const DAY = 86_400_000

const view = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  planId: 'growth',
  status: 'past_due',
  currentPeriodStart: '2026-07-01T00:00:00.000Z',
  currentPeriodEnd: '2026-08-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  pendingPlanId: null,
  pendingPlanEffectiveAt: null,
  graceEndsAt: graceEndsAt(FAILED_AT).toISOString(),
  dunningAttempts: 0,
  lastFailureAt: FAILED_AT.toISOString(),
  lastFailureCode: 'card_declined',
  ...over,
})

describe('stageForStatus', () => {
  it('maps every subscription status, and treats trialing as current', () => {
    expect(stageForStatus('trialing')).toBe('current')
    expect(stageForStatus('active')).toBe('current')
    expect(stageForStatus('past_due')).toBe('past_due')
    expect(stageForStatus('grace')).toBe('grace')
    expect(stageForStatus('suspended')).toBe('suspended')
    expect(stageForStatus('canceled')).toBe('canceled')
  })
})

describe('nextRetryAt', () => {
  it('measures every offset from the FIRST failure, not from the previous attempt', () => {
    // A retry that is itself late must not push the whole sequence back indefinitely.
    expect(nextRetryAt(FAILED_AT, 0)?.toISOString()).toBe('2026-08-02T00:00:00.000Z')
    expect(nextRetryAt(FAILED_AT, 1)?.toISOString()).toBe('2026-08-04T00:00:00.000Z')
    expect(nextRetryAt(FAILED_AT, 2)?.toISOString()).toBe('2026-08-08T00:00:00.000Z')
  })

  it('returns null once the schedule is exhausted, rather than retrying forever', () => {
    expect(nextRetryAt(FAILED_AT, RETRY_OFFSETS_HOURS.length)).toBeNull()
    expect(nextRetryAt(FAILED_AT, 99)).toBeNull()
  })

  it('returns null with no recorded failure — there is nothing to schedule from', () => {
    expect(nextRetryAt(null, 0)).toBeNull()
  })
})

describe('advanceStage — what a sweeper should write', () => {
  it('never starts dunning from the clock alone', () => {
    // Going past due is a fact from the provider, not something a date can infer.
    const active = view({ status: 'active' })
    expect(advanceStage(active, new Date('2027-01-01T00:00:00Z'))).toBe('current')
  })

  it('holds past_due until grace expires, then suspends', () => {
    const v = view({ status: 'past_due' })
    expect(advanceStage(v, new Date(FAILED_AT.getTime() + 1 * DAY))).toBe('grace')
    expect(advanceStage(v, new Date(FAILED_AT.getTime() + (GRACE_DAYS - 1) * DAY))).toBe('grace')
    expect(advanceStage(v, new Date(FAILED_AT.getTime() + GRACE_DAYS * DAY))).toBe('suspended')
  })

  it('closes a suspended subscription only after the full window', () => {
    const v = view({ status: 'suspended' })
    const graceEnd = FAILED_AT.getTime() + GRACE_DAYS * DAY
    expect(advanceStage(v, new Date(graceEnd + 1 * DAY))).toBe('suspended')
    expect(advanceStage(v, new Date(graceEnd + (SUSPENDED_DAYS_BEFORE_CANCEL - 1) * DAY))).toBe(
      'suspended',
    )
    expect(advanceStage(v, new Date(graceEnd + SUSPENDED_DAYS_BEFORE_CANCEL * DAY))).toBe(
      'canceled',
    )
  })

  it('canceled is terminal', () => {
    expect(advanceStage(view({ status: 'canceled' }), new Date('2030-01-01T00:00:00Z'))).toBe(
      'canceled',
    )
  })

  /**
   * The failure mode this exists to stop: a subscription marked past_due with no grace
   * window recorded. Reading the missing timestamp as "expired" would suspend a paying
   * customer because OUR row was incomplete.
   */
  it('holds the stage when the grace window was never recorded, rather than suspending', () => {
    const v = view({ status: 'past_due', graceEndsAt: null })
    expect(advanceStage(v, new Date('2030-01-01T00:00:00Z'))).toBe('past_due')
  })

  it('a suspended subscription with no grace window is never auto-closed', () => {
    const v = view({ status: 'suspended', graceEndsAt: null })
    expect(advanceStage(v, new Date('2030-01-01T00:00:00Z'))).toBe('suspended')
  })
})

describe('dunningPolicy — what the workspace may do', () => {
  it('credits already granted stay spendable at every single stage', () => {
    // The rule the whole module is built around. Swept rather than spot-checked, because
    // this is the one guarantee a future stage must not be able to opt out of.
    for (const status of ['active', 'past_due', 'grace', 'suspended', 'canceled'] as const) {
      const p = dunningPolicy(view({ status }), new Date('2030-01-01T00:00:00Z'))
      expect(p.existingCreditsSpendable).toBe(true)
    }
  })

  it('keeps the paid plan through past due and grace', () => {
    const p = dunningPolicy(view({ status: 'past_due' }), new Date(FAILED_AT.getTime() + DAY))
    expect(p.stage).toBe('grace')
    expect(p.effectivePlanId).toBe('growth')
    expect(DunningPolicySchema.parse(p)).toEqual(p)
  })

  it('drops to Free — never below it — once suspended', () => {
    const p = dunningPolicy(
      view({ status: 'past_due' }),
      new Date(FAILED_AT.getTime() + GRACE_DAYS * DAY),
    )
    expect(p.stage).toBe('suspended')
    expect(p.effectivePlanId).toBe('free')
  })

  it('stops the monthly grant the moment a period goes unpaid', () => {
    // The grant is what a payment buys, so it is the first thing to stop — while the
    // balance already held is untouched.
    expect(dunningPolicy(view({ status: 'active' }), FAILED_AT).monthlyGrantRuns).toBe(true)
    for (const status of ['past_due', 'grace', 'suspended', 'canceled'] as const) {
      expect(dunningPolicy(view({ status }), FAILED_AT).monthlyGrantRuns).toBe(false)
    }
  })

  it('offers a retry while there is still one to make, and null afterwards', () => {
    const withAttempts = (n: number) =>
      dunningPolicy(
        view({ status: 'past_due', dunningAttempts: n }),
        new Date(FAILED_AT.getTime() + DAY),
      )
    expect(withAttempts(0).nextRetryAt).toBe('2026-08-02T00:00:00.000Z')
    expect(withAttempts(3).nextRetryAt).toBeNull()
  })

  it('a suspended account is not still waiting for a retry', () => {
    const p = dunningPolicy(
      view({ status: 'suspended' }),
      new Date(FAILED_AT.getTime() + (GRACE_DAYS + 1) * DAY),
    )
    expect(p.nextRetryAt).toBeNull()
  })

  it('reports when the stage ends, and null when there is genuinely no deadline', () => {
    const grace = dunningPolicy(view({ status: 'past_due' }), new Date(FAILED_AT.getTime() + DAY))
    expect(grace.stageEndsAt).toBe(graceEndsAt(FAILED_AT).toISOString())

    // A current subscription has no dunning deadline. Rendering a date here would tell a
    // paying customer their account changes on a day nothing happens.
    expect(dunningPolicy(view({ status: 'active' }), FAILED_AT).stageEndsAt).toBeNull()
    expect(dunningPolicy(view({ status: 'canceled' }), FAILED_AT).stageEndsAt).toBeNull()
  })
})
