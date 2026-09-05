import { describe, expect, it } from 'vitest'
import { LIVE_SUBSCRIPTION_STATUSES } from '@sahoda/billing'
import { SubscriptionStatusSchema, type PlanId, type SubscriptionView } from '@sahoda/shared'

import { livePlanId, planOfferDecision } from './plan-offer'

/**
 * THE OFFER IS DECIDED BY THE ACCOUNT, AND THESE ARE THE WAYS THAT GOES WRONG.
 *
 * Half of these assert SILENCE. A guard that only proves the modal appears
 * would pass just as happily on `return { kind: 'offer' }` — the expensive
 * failure here is showing a pricing wall to somebody who already paid, and it
 * is the one a happy-path test cannot see.
 */

const view = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  planId: 'free',
  status: 'active',
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  pendingPlanId: null,
  pendingPlanEffectiveAt: null,
  graceEndsAt: null,
  dunningAttempts: 0,
  lastFailureAt: null,
  lastFailureCode: null,
  ...over,
})

const PAID: readonly PlanId[] = ['starter', 'growth', 'agency']

describe('planOfferDecision', () => {
  it('offers to a workspace with no subscription row, which reads as free and active', () => {
    // This IS the shape `readSubscription` synthesises when the table has no row
    // for the workspace: `freeSubscription()` returns planId free, status active.
    expect(planOfferDecision({ status: 'ok', data: view() })).toEqual({ kind: 'offer' })
  })

  it.each(PAID)('stays silent for a live %s subscriber', (planId) => {
    expect(planOfferDecision({ status: 'ok', data: view({ planId, status: 'active' }) })).toEqual({
      kind: 'silent',
      because: 'has-plan',
    })
  })

  it.each(['trialing', 'past_due', 'grace'] as const)(
    'stays silent for a paid plan that is %s — still being served, still theirs',
    (status) => {
      expect(planOfferDecision({ status: 'ok', data: view({ planId: 'growth', status }) })).toEqual(
        { kind: 'silent', because: 'has-plan' },
      )
    },
  )

  it.each(['canceled', 'suspended'] as const)(
    'offers again once a paid plan is %s — the row survives, the plan does not',
    (status) => {
      // The regression this pins: `readSubscription` hands back the NEWEST row
      // whatever its status, so a customer who cancelled Growth still arrives
      // carrying `planId: 'growth'`. A plain `planId === 'free'` test would
      // decide they have a plan and never offer them one again.
      expect(planOfferDecision({ status: 'ok', data: view({ planId: 'growth', status }) })).toEqual(
        { kind: 'offer' },
      )
    },
  )

  it('stays silent until the workspace has done something, so it never covers the first dashboard', () => {
    // MEASURED 2026-09-05 in a browser: a workspace that had just finished
    // onboarding was met by this dialog before it had seen its own dashboard.
    // Founder's ruling the same day: the offer waits for the first action.
    expect(planOfferDecision({ status: 'ok', data: view() }, { hasStarted: false })).toEqual({
      kind: 'silent',
      because: 'not-started',
    })
    expect(planOfferDecision({ status: 'ok', data: view() }, { hasStarted: true })).toEqual({
      kind: 'offer',
    })
  })

  it('stays silent when there is no workspace, because checkout has nothing to charge for', () => {
    expect(planOfferDecision({ status: 'no-workspace' })).toEqual({
      kind: 'silent',
      because: 'no-workspace',
    })
  })

  it('stays silent when the read failed, rather than guessing free', () => {
    // The expensive error: a paying customer meets a pricing wall because one
    // query did not answer. Not knowing is not the same as knowing they are free.
    expect(planOfferDecision({ status: 'unreadable' })).toEqual({
      kind: 'silent',
      because: 'unknown',
    })
  })
})

describe('livePlanId', () => {
  it.each(['trialing', 'active', 'past_due', 'grace'] as const)(
    'reports the plan while %s',
    (status) => {
      expect(livePlanId(view({ planId: 'starter', status }))).toBe('starter')
    },
  )

  it.each(['canceled', 'suspended'] as const)('reports nothing while %s', (status) => {
    expect(livePlanId(view({ planId: 'starter', status }))).toBeNull()
  })

  /**
   * THE PIN, AND IT IS A REAL ONE NOW.
   *
   * This assertion used to type the four statuses by hand and import nothing,
   * so it could never have caught the drift its own comment described: adding a
   * fifth status on the enforcement side would have left the two answers to "is
   * this customer on a plan" disagreeing, one gating the features and one
   * deciding whether to sell them, with nothing to say so. It now reads the
   * exported set, so the two cannot part company without this going red.
   */
  it('serves a plan for exactly the statuses the entitlement resolver serves one for', () => {
    for (const status of LIVE_SUBSCRIPTION_STATUSES) {
      expect(livePlanId(view({ planId: 'growth', status }))).toBe('growth')
    }
    const closed = SubscriptionStatusSchema.options.filter(
      (status) => !LIVE_SUBSCRIPTION_STATUSES.includes(status as never),
    )
    // Not an empty sweep: the schema has six statuses and four are live, so this
    // must be exactly the other two. A filter that matched nothing would make
    // the loop below vacuous and this test decorative.
    expect(closed).toEqual(['suspended', 'canceled'])
    for (const status of closed) {
      expect(livePlanId(view({ planId: 'growth', status }))).toBeNull()
    }
  })
})
