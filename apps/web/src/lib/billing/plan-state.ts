import type { DowngradeImpact, PlanId, Proration } from '@sahoda/shared'

/**
 * Action results for the plan screen.
 *
 * In their own module because a `'use server'` file may export only async functions — the
 * same reason `lib/wallet/checkout-state.ts` exists.
 */

/** What a plan change would do, computed on the server and shown BEFORE anything is charged. */
export type PlanPreviewState =
  | {
      ok: true
      proration: Proration
      /**
       * What being on the new plan would mean for what the workspace already holds.
       *
       * NULL when the counts could not be read. Deliberately not an empty impact: "nothing is
       * over your limit" and "we could not count what you have" are different claims, and
       * only one of them should let the customer press the button without a warning.
       */
      impact: DowngradeImpact | null
    }
  | { ok: false; message: string }

/** A write that either happened or did not. No partial state is representable. */
export type PlanActionState = { ok: true; message: string } | { ok: false; message: string }

/**
 * Starting an upgrade.
 *
 * `simulated` is an explicit discriminant rather than something inferred from a missing URL,
 * for the reason `CheckoutState` gives: a caller must not be able to render a sandbox session
 * as a completed purchase by forgetting a check.
 */
export type UpgradeCheckoutState =
  | {
      ok: true
      simulated: true
      mode: 'fixture' | 'sandbox'
      sessionId: string
      planId: PlanId
      /** What the customer WOULD have paid. Shown so the sandbox state is still informative. */
      amountDuePaise: number
    }
  | { ok: true; simulated: false; mode: 'live'; sessionId: string; url: string }
  | { ok: false; message: string }
