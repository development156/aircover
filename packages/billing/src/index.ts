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

// Billing period format contract (YYYY-MM) — the grant replay anchor
export * from './period'

// Ledger ports (interface + direct-Postgres implementation)
export * from './ledger/port'
export * from './ledger/pg'

// Server-only env
export * from './env'

// Entitlements gate — called BEFORE withCredits at every AI entry point (owner ruling #5)
export * from './entitlements/port'
export * from './entitlements/pg'
export * from './entitlements/checkEntitlement'

// HTTP port for payment adapters (fixture replay in tests, global fetch in prod)
export * from './transport'

// Payment-rail seam + fixture provider
export * from './providers/types'
export * from './providers/fixture'

// Webhook → ledger: idempotent event store + the process orchestrator + the grant
export * from './webhooks/applyPlanGrant'
export * from './webhooks/store'
export * from './webhooks/pgStore'
export * from './webhooks/processPaymentEvent'
