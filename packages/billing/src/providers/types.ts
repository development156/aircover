import type { PlanId } from '@sahoda/shared'

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
  /** Verify the webhook signature over the EXACT raw body — always called before parse. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean
  /** Parse a (verified) webhook body into the normalized event billing acts on. */
  parseWebhookEvent(rawBody: string): ParsedWebhookEvent
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
  /** Provider-side checkout/session id. */
  id: string
  /** Hosted checkout URL to redirect the user to. */
  url: string
  mode: PaymentMode
}

/**
 * A provider webhook normalized to what billing acts on. `raw` is retained verbatim so
 * the (deferred) billing_webhook_events row can store the original payload.
 */
export interface ParsedWebhookEvent {
  /** Which provider produced it (billing-internal id). */
  provider: string
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
