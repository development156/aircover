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

// Direct-pg TLS decision + the mandatory pool error guard. Exported because ANY process that
// builds its own Pool must reuse this rule rather than re-deriving it: the host a DSN really
// dials is not `new URL().hostname` (`?host=` overrides it, and a repeated `?host=` keeps the
// LAST), so an independent re-implementation silently relaxes certificate verification against
// an attacker-controlled host. apps/jobs had exactly that drift.
export * from './pgSsl'

// Server-only env
export * from './env'

// Entitlements gate — called BEFORE withCredits at every AI entry point (owner ruling #5)
export * from './entitlements/port'
export * from './entitlements/pg'
export * from './entitlements/checkEntitlement'

// Plan lifecycle — the pure calculators. No database, no clock of their own, no I/O.
// Every one of them is a function of (catalog, config, clock) so a screen can show a
// customer what a change costs BEFORE anything is charged.
export * from './tax/computeTax'
export * from './plans/proration'
export * from './plans/downgradeImpact'
export * from './dunning/dunning'

// Reversing money — chargebacks and refunds, as COMPENSATING ENTRIES. Never an edit.
export * from './reversals/applyReversal'

// Free-tier abuse controls. Counts of real rows only — no score, ever.
export * from './abuse/freeTier'

// GST invoicing — the Indian financial year, the supplier registration (from env, with NO
// defaults), and the document assembler. The serial is allocated by app.issue_invoice.
export * from './invoices/financialYear'
export * from './invoices/gstEnv'
export * from './invoices/buildInvoice'
export * from './invoices/pg'

// HTTP port for payment adapters (fixture replay in tests, global fetch in prod)
export * from './transport'

// Payment-rail seam + fixture provider
export * from './providers/types'
export * from './providers/fixture'

// Cashfree (India) rail — sandbox now, live behind CASHFREE_ENV
export * from './providers/cashfree/env'
export * from './providers/cashfree/signature'
export * from './providers/cashfree/webhook'
export * from './providers/cashfree'

// Webhook → ledger: idempotent event store + the process orchestrator + the grant
export * from './webhooks/applyPlanGrant'
export * from './webhooks/store'
export * from './webhooks/pgStore'
export * from './webhooks/processPaymentEvent'
