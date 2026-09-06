import type { BillingProvider, PlanId } from '@sahoda/shared'

/**
 * The payment-rail seam. Billing-INTERNAL for Alpha (owner ruling #2 — promote to
 * @sahoda/shared post-Alpha). Docs call this concept `BillingService`; the interface
 * name is `PaymentProvider` (owner ruling #4). The fixture double implements it now;
 * Cashfree (sandbox) then Stripe / Razorpay implement the same shape behind the enum
 * widening tracked in LEARNINGS.
 */
export interface PaymentProvider {
  /** Billing-internal provider id (mirrors the widened billing provider enum): 'fixture' | 'cashfree' | … */
  readonly id: string
  readonly mode: PaymentMode
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>
  /**
   * Verify the webhook signature over the EXACT raw body — always called before parse.
   *
   * `rawBody` must be the bytes as received (`await req.text()`), never a re-stringified
   * parse: JSON round-tripping reorders keys and normalizes numbers (`1.80` → `1.8`), which
   * silently breaks any HMAC computed over the original payload.
   */
  verifyWebhookSignature(rawBody: string, signature: string, meta?: WebhookVerifyMeta): boolean
  /** Parse a (verified) webhook body into the normalized event billing acts on. */
  parseWebhookEvent(rawBody: string): ParsedWebhookEvent
}

/**
 * Out-of-band material some rails sign alongside the body. Cashfree computes
 * `base64(HMAC_SHA256(secret, timestamp + rawBody))` and sends the timestamp in the
 * `x-webhook-timestamp` header, so the signature cannot be checked from the body alone.
 * Optional so providers that sign the body only (the fixture) are unaffected.
 */
export interface WebhookVerifyMeta {
  /** The provider's signing timestamp — Cashfree's `x-webhook-timestamp` header, verbatim. */
  timestamp?: string
}

/** Honesty flag on every provider output — fixture output is always labelled, never shown as a real charge. */
export type PaymentMode = 'fixture' | 'sandbox' | 'live'

/** Normalized event types; Alpha acts only on `payment_succeeded`. */
export type PaymentEventType = 'payment_succeeded' | 'payment_failed' | 'unknown'

export interface CreateCheckoutInput {
  workspaceId: string
  planId: PlanId
  /** Billing period this checkout is for, e.g. '2026-07' — keys the monthly grant idempotently. */
  period: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  /**
   * A mid-period PLAN CHANGE rather than a plain month's purchase.
   *
   * Present only for an upgrade, where neither the amount nor the credits are the plan's
   * catalogue figures: the customer pays for the remainder of the period and receives the
   * matching part of the credit difference. Both numbers are computed by `computeProration`
   * BEFORE the order is opened, and they travel to the webhook inside `order_tags` — the
   * only carrier a Cashfree webhook has.
   *
   * Absent for a normal purchase, which keeps the existing catalogue-price path untouched.
   */
  planChange?: PlanChangeCheckout
}

/** The prorated figures an upgrade order carries. Every one of them is ours, not the customer's. */
export interface PlanChangeCheckout {
  /**
   * Identifies THIS change. Becomes the ledger idempotency key via `planChangeGrantKey`,
   * deliberately NOT `monthlyGrantKey`: that key is (plan, period, workspace) with no change
   * in it, so a second upgrade to a plan already granted this month would REPLAY — returning
   * `replayed: true` and granting nothing, while real money had just been taken.
   */
  changeId: string
  /** What the customer actually pays now, in paise. Overrides the catalogue price. */
  amountPaise: number
  /** Credits this change grants. Never more than the plan's own monthly allotment. */
  credits: number
}

export interface CheckoutSession {
  /** Provider-side checkout/session id. For Cashfree this is our own `order_id`. */
  id: string
  /** Hosted checkout URL to redirect the user to. */
  url: string
  mode: PaymentMode
  /**
   * Provider session token for rails whose checkout is SDK-driven rather than a hosted page.
   * Cashfree returns a `payment_session_id` and publishes no documented redirect URL, so
   * `url` points at an app-owned bridge route that hands this to `cashfree-js`. Optional —
   * rails with a genuine hosted page (and the fixture) leave it unset.
   */
  sessionId?: string
}

/**
 * A provider-side order read back by `GET /orders/{id}`: what the checkout bridge page and
 * the webhook fallback both act on.
 */
export interface ProviderOrder {
  orderId: string
  /**
   * The provider's own order status, verbatim. Cashfree's vocabulary is ACTIVE (payable),
   * PAID, EXPIRED, TERMINATED and TERMINATION_REQUESTED; `null` when the response carried
   * none. Deliberately not narrowed to a union: a status this package has not seen must
   * reach the screen as "unknown", never be coerced into one it recognises.
   */
  status: string | null
  tags: Record<string, string> | null
  /**
   * The SDK session token the bridge page hands to the Cashfree JS SDK. `null` when the
   * provider omits it, which it does once an order is no longer payable. Without this field
   * the bridge had an order and nothing to pay with.
   */
  paymentSessionId: string | null
}

/**
 * A provider webhook normalized to what billing acts on. `raw` is retained verbatim so
 * the (deferred) billing_webhook_events row can store the original payload.
 */
export interface ParsedWebhookEvent {
  /** Which provider produced it — the widened billing provider enum ('fixture'|'cashfree'|…). */
  provider: BillingProvider
  /** Unique event id — the idempotency key for billing_webhook_events (provider, event_id). */
  eventId: string
  eventType: PaymentEventType
  workspaceId: string
  planId: PlanId
  /** Billing period — keys the monthly grant (monthlyGrantKey). */
  period: string
  mode: PaymentMode
  /**
   * Set when the order was a mid-period PLAN CHANGE rather than a month's purchase.
   *
   * When present the grant is keyed on the change and grants `credits`, not the plan's full
   * monthly allotment. When absent nothing about the existing path changes — which is why
   * this is optional rather than a second event type.
   */
  planChange?: { changeId: string; credits: number }
  raw: unknown
}
