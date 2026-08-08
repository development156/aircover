/**
 * `@sahoda/billing/server-webhook` — the ONLY entry point a public webhook endpoint
 * may import.
 *
 * ── WHY A SEPARATE ENTRY POINT EXISTS ────────────────────────────────────────
 * The main barrel (`./index.ts:42`) does `export * from './providers/fixture'`, so any
 * module importing `@sahoda/billing` pulls the fixture provider — and its secret — into
 * scope. `providers/fixture.ts:14` hardcodes `DEFAULT_SECRET = 'fixture-webhook-secret'`
 * as a source literal, and this repository is PUBLIC. A public endpoint that could reach
 * that verifier is a credit-forgery path: sign `{workspace_id, plan_id, period}` with a
 * secret anyone can read, receive a month of credits.
 *
 * The requirement was that accepting a fixture-signed webhook be structurally
 * impossible rather than a runtime check. A runtime check is a branch, and a branch can
 * be inverted, short-circuited, or made unreachable by a refactor without any test
 * noticing. So the fixture is excluded from the IMPORT GRAPH instead: it is not exported
 * here, nothing exported here transitively imports it, and `server-webhook.guard.test.ts`
 * fails if that ever stops being true.
 *
 * Two layers, both structural:
 *   1. this module — the fixture is not reachable;
 *   2. `LiveVerifiedBody` (./providers/cashfree/verified) — the parser accepts only a
 *      body whose Cashfree HMAC has been verified, so parse-before-verify does not
 *      compile.
 *
 * Do NOT add `export * from './index'` here, and do not re-export anything from
 * `./providers/fixture`. Widening this surface is the one change that reopens the hole.
 */

// The verification gate and its branded body. Nothing else can mint a LiveVerifiedBody.
export {
  verifyCashfreeWebhook,
  parseVerifiedCashfreeWebhook,
  type LiveVerifiedBody,
  type VerifyCashfreeWebhookInput,
} from './providers/cashfree/verified'

// Cashfree env + the tag/amount contract the parser enforces.
export { loadCashfreeEnv, type CashfreeEnv } from './providers/cashfree/env'
export { CASHFREE_ID, CashfreeTagsMissingError } from './providers/cashfree/webhook'

// The normalized event shape the endpoint hands on. Types only — no implementations.
export type { ParsedWebhookEvent, PaymentEventType, PaymentMode } from './providers/types'

// Webhook → ledger. Every credit movement still goes through app.apply_ledger_entry:
// processPaymentEvent → applyPlanGrant → LedgerPort.apply.
export { processPaymentEvent } from './webhooks/processPaymentEvent'
export type { ProcessPaymentEventDeps } from './webhooks/processPaymentEvent'
export { applyPlanGrant } from './webhooks/applyPlanGrant'
export { createPgWebhookEventStore } from './webhooks/pgStore'
export type { WebhookEventStore } from './webhooks/store'
export { createPgLedgerPort, type PgLedgerPort } from './ledger/pg'
export type { LedgerPort, ApplyLedgerInput } from './ledger/port'
export { loadBillingEnv } from './env'
