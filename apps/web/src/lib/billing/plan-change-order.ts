import { createHash } from 'node:crypto'
import type { PaymentMode, ProviderOrder } from '@sahoda/billing'
import type { PlanId } from '@sahoda/shared'
import type { UpgradeCheckoutState } from './plan-state'

/**
 * Server-side idempotency for `startPlanUpgrade` — audit finding Q-06.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────
 * `createCashfreeProvider.createCheckout` used to mint its own `order_id` from a fresh
 * `randomUUID()` on every call, so two rapid `startPlanUpgrade` calls for the SAME upgrade
 * opened two Cashfree orders. The only thing standing between one submit and two orders was
 * the client disabling its own button — not a guarantee a retried form post or a slow
 * double-tap honours.
 *
 * Deriving the id from what is being bought, rather than minting a fresh one per call, makes
 * two identical requests land on the identical order: Cashfree's `POST /orders` refuses a
 * second order under an `order_id` that already exists, and `startPlanUpgrade` checks
 * `fetchOrder` for that id BEFORE ever calling `createCheckout`, so the second call finds
 * the first call's order rather than attempting to create a duplicate at all.
 */

/**
 * A deterministic Cashfree order id for one workspace's upgrade to one plan inside one
 * billing period.
 *
 * A truncated sha256 rather than the raw triple: Cashfree caps `order_id` length, and the
 * triple would also put a raw workspace id into a value that ends up in a URL path.
 */
export function planChangeOrderId(workspaceId: string, planId: string, period: string): string {
  const hash = createHash('sha256').update(`${workspaceId}:${planId}:${period}`).digest('hex')
  // No `sah_` prefix here: `createCashfreeProvider.createCheckout` prepends it itself
  // (`orderId = \`sah_${newId()}\``), and this value IS what gets injected as `newId`.
  return `chg_${hash.slice(0, 24)}`
}

/**
 * `POST /orders` under an `order_id` that already exists — the shape a GENUINELY
 * concurrent pair of `startPlanUpgrade` calls can still hit: both see `isOrderNotFound`
 * on the pre-check (neither order exists yet) and both call `createCheckout` with the
 * same deterministic id; the loser gets this instead of a fresh order. 409 rather than a
 * Cashfree error code, because `index.ts`'s own idempotency-key comment already names 409
 * as what a duplicate `order_id` raises, and no narrower shape is confirmed against a live
 * account (see the report for this change).
 */
export function isDuplicateOrder(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 409
  )
}

/**
 * Mirrors the bridge URL `createCashfreeProvider.createCheckout` builds internally. Needed
 * only for a REUSED order, whose session was read back via `fetchOrder` rather than just
 * returned from `createCheckout` — `ProviderOrder` carries no `url`, only the pieces
 * `createCheckout` would have used to build one.
 */
export function checkoutBridgeUrl(appBaseUrl: string, orderId: string): string {
  const base = appBaseUrl.endsWith('/') ? appBaseUrl.slice(0, -1) : appBaseUrl
  return `${base}/billing/checkout/${encodeURIComponent(orderId)}`
}

/**
 * The `UpgradeCheckoutState` for an order someone else already opened — from the pre-check
 * finding it, or from `createCheckout` colliding with it and `fetchOrder` reading it back.
 * Both recovery paths in `startPlanUpgrade` return exactly this, so the two callers cannot
 * drift into two different shapes of "reused".
 *
 * `null` when the order Cashfree/`fetchOrder` describes is not one this can safely hand
 * back — no `payment_session_id` means it is no longer payable (EXPIRED, TERMINATED, …),
 * and returning it anyway would send a customer to a checkout page with nothing to pay with.
 */
export function reusedCheckoutState(
  mode: PaymentMode,
  order: ProviderOrder,
  fullOrderId: string,
  planId: PlanId,
  amountDuePaise: number,
  appBaseUrl: string,
): UpgradeCheckoutState | null {
  if (order.status !== 'ACTIVE' || !order.paymentSessionId) return null

  // `sessionId` is the ORDER id here, matching the freshly-created branch in
  // `startPlanUpgrade` — never Cashfree's `payment_session_id` token, which the checkout
  // bridge page reads for itself off the order once redirected there.
  if (mode !== 'live') {
    return {
      ok: true,
      simulated: true,
      mode,
      sessionId: fullOrderId,
      planId,
      amountDuePaise,
      reused: true,
    }
  }
  return {
    ok: true,
    simulated: false,
    mode: 'live',
    sessionId: fullOrderId,
    url: checkoutBridgeUrl(appBaseUrl, fullOrderId),
    reused: true,
  }
}
