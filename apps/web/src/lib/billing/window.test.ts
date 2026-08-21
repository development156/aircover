import { describe, expect, it } from 'vitest'
import type { SubscriptionView } from '@sahoda/shared'
import { billingWindow, calendarMonth } from './window'

const view = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  planId: 'growth',
  status: 'active',
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  pendingPlanId: null,
  pendingPlanEffectiveAt: null,
  graceEndsAt: null,
  dunningAttempts: 0,
  lastFailureAt: null,
  lastFailureCode: null,
  ...over,
})

const NOW = new Date('2026-08-16T12:00:00.000Z')

describe('calendarMonth', () => {
  it('spans the first of the month to the first of the next, in UTC', () => {
    const { start, end } = calendarMonth(NOW)
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('rolls December into January of the next year without a special case', () => {
    const { start, end } = calendarMonth(new Date('2026-12-20T00:00:00.000Z'))
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('handles February in a leap year and a common year', () => {
    expect(calendarMonth(new Date('2028-02-10T00:00:00Z')).end.toISOString()).toBe(
      '2028-03-01T00:00:00.000Z',
    )
    expect(calendarMonth(new Date('2026-02-10T00:00:00Z')).end.toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    )
  })

  it('refuses an invalid date rather than producing an Invalid Date window', () => {
    expect(() => calendarMonth(new Date('nonsense'))).toThrow(/invalid date/)
  })
})

describe('billingWindow', () => {
  it('uses the subscription window when it has one', () => {
    const w = billingWindow(view(), NOW)
    expect(w.derivedFromCalendar).toBe(false)
    expect(w.start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(w.currentPeriodPaid).toBe(true)
  })

  it('falls back to the calendar month for a workspace with no subscription', () => {
    // A free workspace has no renewal date — putting one on the screen would invent a fact.
    // A first purchase still has to prorate against something, and the calendar month is
    // already the unit `monthlyGrantKey` counts in.
    const w = billingWindow(
      view({ planId: 'free', currentPeriodStart: null, currentPeriodEnd: null }),
      NOW,
    )
    expect(w.derivedFromCalendar).toBe(true)
    expect(w.start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('never treats free as paid, even if the row says active', () => {
    // There is nothing to set off against a new charge, because nothing was charged.
    const w = billingWindow(view({ planId: 'free' }), NOW)
    expect(w.currentPeriodPaid).toBe(false)
  })

  it('treats a workspace in dunning as UNPAID for the current period', () => {
    // It received the period's entitlements without paying. Crediting it the old plan's
    // unused value on an upgrade would hand over the price difference for nothing.
    for (const status of ['past_due', 'grace', 'suspended', 'canceled'] as const) {
      expect(billingWindow(view({ status }), NOW).currentPeriodPaid, status).toBe(false)
    }
    expect(billingWindow(view({ status: 'trialing' }), NOW).currentPeriodPaid).toBe(true)
  })

  /**
   * A half-recorded window would produce a proration fraction from one real date and one
   * guess. Using neither is the honest answer, and the calendar month is a derivation the
   * rest of the system already makes.
   */
  it('falls back to the calendar when the recorded window is half-written or inverted', () => {
    const halves: Partial<SubscriptionView>[] = [
      { currentPeriodStart: null },
      { currentPeriodEnd: null },
      {
        currentPeriodStart: '2026-09-01T00:00:00.000Z',
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      },
      {
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      },
      { currentPeriodStart: 'not-a-date' as string },
    ]
    for (const over of halves) {
      const w = billingWindow(view(over), NOW)
      expect(w.derivedFromCalendar, JSON.stringify(over)).toBe(true)
      expect(w.end.getTime()).toBeGreaterThan(w.start.getTime())
    }
  })
})
