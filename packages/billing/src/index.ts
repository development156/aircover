// @sahoda/billing — the withCredits() wrapper (HOLD → run → DEBIT on success /
// RELEASE on failure), the direct-Postgres ledger port, the PaymentProvider seam
// (fixture double now; Cashfree/Stripe/Razorpay later), and the monthly plan grant.
// Owned by wt-billing. Server-only.
//
// Credit action costs come ONLY from pricing.config.json via @sahoda/shared's
// creditCost(); plan grants come from PLAN_CATALOG. The ledger is written ONLY via
// app.apply_ledger_entry(). Entitlement gating is a separate helper called BEFORE
// withCredits at each AI entry point (owner ruling #5) — not part of this wrapper.
export const BILLING_PACKAGE = '@sahoda/billing' as const

// Credit wrapper
export * from './withCredits'

// Ledger ports (interface + direct-Postgres implementation)
export * from './ledger/port'
export * from './ledger/pg'

// Server-only env
export * from './env'

// Payment-rail seam + fixture provider
export * from './providers/types'
export * from './providers/fixture'

// Webhook → ledger
export * from './webhooks/applyPlanGrant'
