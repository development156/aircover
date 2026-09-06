import { createHash } from 'node:crypto'
import type { PaymentMode, ProviderOrder } from '@sahoda/billing'
import type { PlanId } from '@sahoda/shared'
import { checkoutBridgeUrl } from '@/lib/billing/plan-change-order'
import type { CheckoutState } from './checkout-state'

/**
 * Server-side idempotency for `startCheckout` — the wallet half of audit finding
 * Q-06. `startPlanUpgrade` got this in `lib/billing/plan-change-order.ts`; the
 * top-up action had the identical defect and the identical single line of
 * defence (a button that disables itself in flight).
 *
 * ── THE SAME DEFECT, ONE ROUTE OVER ──────────────────────────────────────────
 * `createCashfreeProvider.createCheckout` mints `order_id` from `randomUUID()`
 * unless the caller injects `newId`. `startCheckout` did not inject one, so two
 * rapid presses of "Top up" opened two Cashfree orders for the same pack in the
 * same month. Derive the id from what is being bought instead, look the order
 * up BEFORE creating it, and hand the second call the first call's order.
 *
 * ── WHY THIS IS SAFE FOR A PACK SOMEBODY BUYS TWICE ──────────────────────────
 * A deterministic id is reused only while the order it names is still ACTIVE
 * and payable. Once it is PAID, EXPIRED or TERMINATED, `startCheckout` flips to
 * a fresh random id, so a second genuine purchase in the same month is a second
 * order, and only an unpaid duplicate is folded into the first.
 */
export function topupOrderId(workspaceId: string, planId: string, period: string): string {
  const hash = createHash('sha256').update(`topup:${workspaceId}:${planId}:${period}`).digest('hex')
  // No `sah_` prefix: the provider prepends it (`sah_${newId()}`); this IS `newId`.
  return `top_${hash.slice(0, 24)}`
}

/**
 * The `CheckoutState` for an order an earlier call already opened. `null` when
 * that order is no longer payable: sending a customer to a checkout page with
 * nothing to pay with is worse than opening a fresh order.
 */
export function reusedTopupState(
  mode: PaymentMode,
  order: ProviderOrder,
  fullOrderId: string,
  planId: PlanId,
  appBaseUrl: string,
): CheckoutState | null {
  if (order.status !== 'ACTIVE' || !order.paymentSessionId) return null
  if (mode !== 'live') {
    return { ok: true, simulated: true, mode, sessionId: fullOrderId, planId, reused: true }
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
