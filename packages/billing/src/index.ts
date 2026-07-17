// @sahoda/billing — the withCredits() wrapper (entitlement gate → HOLD → run →
// DEBIT/RELEASE), the Stripe test-mode checkout + idempotent webhook handler,
// entitlements resolution, and wallet data access. Owned by wt-billing.
//
// Credit prices come only from pricing.config.json via @sahoda/shared's
// creditCost(). Webhooks are idempotent by event id (billing_webhook_events).
// Stripe test-mode only until backlog #8 (live + Razorpay).
export const BILLING_PACKAGE = '@sahoda/billing' as const
