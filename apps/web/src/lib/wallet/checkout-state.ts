import type { PlanId } from '@sahoda/shared'

/**
 * Checkout action state. Lives outside the `'use server'` module that returns it
 * (a `'use server'` file may export only async functions).
 *
 * The `simulated` discriminant is deliberately explicit rather than inferred
 * from the absence of a URL: a caller must not be able to render a fixture or
 * sandbox session as a completed purchase by forgetting a check.
 */
export type CheckoutState =
  | {
      ok: true
      simulated: true
      mode: 'fixture' | 'sandbox'
      sessionId: string
      planId: PlanId
      /** An order an earlier call opened for the same pack, still unpaid. */
      reused?: true
    }
  | { ok: true; simulated: false; mode: 'live'; sessionId: string; url: string; reused?: true }
  | { ok: false; message: string }

/**
 * The billing period a top-up is for, as `YYYY-MM`. This keys the monthly grant
 * idempotently on the billing side, so it must be UTC-stable — a local-time
 * month boundary would produce two different periods for the same instant
 * depending on the server's zone.
 */
export function currentBillingPeriod(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new RangeError('currentBillingPeriod: invalid date')
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
