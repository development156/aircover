import type { SubscriptionView } from '@sahoda/shared'

/**
 * The billing window a plan change is prorated against, and whether it has been paid for.
 *
 * ── WHY A FREE WORKSPACE STILL HAS A WINDOW ──────────────────────────────────
 * A workspace with no subscription has no `current_period_start` — `readSubscription`
 * returns null for both, deliberately, because putting a renewal date on a screen where
 * nothing renews would be an invented fact.
 *
 * But a first purchase mid-month still has to be prorated against SOMETHING, and the answer
 * is not invented: grants are keyed by `monthlyGrantKey(plan, period, workspace)` where
 * `period` is a CALENDAR MONTH (`currentBillingPeriod`). The calendar month is already the
 * unit the whole billing system counts in, so deriving the window from it is reading an
 * existing decision rather than making a new one.
 *
 * ── AND WHY "PAID" IS DERIVED FROM STATUS RATHER THAN ASSUMED ────────────────
 * `computeProration` sets the unused value of the OLD plan against the new charge, and doing
 * that for a workspace that never paid for the current period hands over the price
 * difference for nothing. A workspace in dunning received the entitlements without paying,
 * so its status is the honest answer to "has this period been paid for".
 */

export interface BillingWindow {
  start: Date
  end: Date
  /** True only for a paid plan whose current period is genuinely settled. */
  currentPeriodPaid: boolean
  /** True when the window was derived from the calendar rather than read from a subscription. */
  derivedFromCalendar: boolean
}

/** Statuses under which the current period has actually been paid for. */
const SETTLED: ReadonlySet<SubscriptionView['status']> = new Set(['active', 'trialing'])

export function billingWindow(view: SubscriptionView, now: Date): BillingWindow {
  const start = view.currentPeriodStart ? new Date(view.currentPeriodStart) : null
  const end = view.currentPeriodEnd ? new Date(view.currentPeriodEnd) : null

  // Both, valid, and in order — or the calendar. A half-recorded window would produce a
  // proration fraction from one real date and one guess, which is worse than using neither.
  const usable =
    start !== null &&
    end !== null &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end.getTime() > start.getTime()

  if (usable) {
    return {
      start: start as Date,
      end: end as Date,
      // Free never counts as paid even if a row somehow says active: there is nothing to
      // set off, because nothing was charged.
      currentPeriodPaid: view.planId !== 'free' && SETTLED.has(view.status),
      derivedFromCalendar: false,
    }
  }

  return {
    ...calendarMonth(now),
    currentPeriodPaid: false,
    derivedFromCalendar: true,
  }
}

/**
 * The UTC calendar month containing `now`.
 *
 * UTC for the reason `currentBillingPeriod` is: a local-time month boundary produces two
 * different periods for the same instant depending on the server's zone, and the period
 * string is the sole replay anchor inside `monthlyGrantKey`.
 */
export function calendarMonth(now: Date): { start: Date; end: Date } {
  if (Number.isNaN(now.getTime())) throw new RangeError('calendarMonth: invalid date')
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    // Day 1 of the NEXT month. Date normalises month 12 into January of the next year, so
    // December needs no special case — and hand-rolling one is how an off-by-one gets in.
    end: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  }
}
