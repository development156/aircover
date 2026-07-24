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
  raw: unknown
}
