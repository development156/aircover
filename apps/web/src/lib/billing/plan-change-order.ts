import { createHash } from 'node:crypto'

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
 * Cashfree's `GET /orders/{id}` answers 404 for an id nothing has ever been created
 * against — the expected shape of the FIRST attempt at any given upgrade. Anything else
 * (401, 5xx, a timeout) is a real failure and must still reach `checkoutFailureMessage`,
 * not be read as "no order yet" and papered over with a fresh create.
 */
export function isOrderNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 404
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
