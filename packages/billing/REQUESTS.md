# packages/billing — cross-worktree contract requests

Requests to **wt-db** (`packages/db`) and the shared-contract owner (`packages/shared`).
Billing owns none of these files, so they are specified here for the owning lane to apply.

## 1. Provider-enum widening (owner ruling #1) — ✅ DONE

**Status:** landed on main (wt-db migration `20260718193834_widen_billing_provider`) and wired —
`WebhookEventStore` (pg) + `processPaymentEvent` now write the `billing_webhook_events` row with
`(provider, event_id)` idempotency, and `ParsedWebhookEvent.provider` is narrowed to
`BillingProvider`. The spec below is retained for the record.

**Needed by:** the `billing_webhook_events` insert in the webhook handler.

**Change:**

- `packages/shared/src/enums.ts` — widen `BillingProviderSchema`:
  ```ts
  // from
  export const BillingProviderSchema = z.enum(['stripe', 'razorpay'])
  // to (Alpha uses the fixture double + Cashfree sandbox; stripe/razorpay stay for later)
  export const BillingProviderSchema = z.enum(['fixture', 'cashfree', 'stripe', 'razorpay'])
  ```
- The mirroring Postgres `CHECK` constraints (text + CHECK strategy, decision D9) on:
  - `billing_webhook_events.provider`
  - `subscriptions.provider`

  must be widened to the same set in a **new** migration (never edit an applied one).

**What billing wires when it lands (rebase onto main):**

1. In the webhook handler, before `applyPlanGrant`, insert a `billing_webhook_events`
   row `(provider, event_id, event_type, payload, status)` — the `(provider, event_id)`
   unique index gives provider-level replay dedup + an audit trail on top of the ledger's
   `monthlyGrantKey` idempotency (which alone already prevents double-grant today).
2. `ParsedWebhookEvent.provider` (currently a plain `string`, billing-internal) can then be
   narrowed to `BillingProvider`.

Until it lands: replay-safety rests solely on `monthlyGrantKey` — sufficient to prevent a
double-grant, verified by `applyPlanGrant.integration.test.ts`. **No fake insert is written.**

## 2. `plans.stripe_price_id` → `provider_price_id` (nice-to-have, non-blocking)

`PlanSchema.stripe_price_id` (`packages/shared/src/db/billing.ts`) is provider-specific naming
in a now provider-agnostic model (fixture / Cashfree / Razorpay / Stripe). Suggest renaming to
`provider_price_id` (nullable) when the enum widening migration is cut, so a plan can carry the
active rail's price id without a Stripe-shaped column. Breaking change ⇒ `[contract]` PR prefix.
Billing does not read this column yet, so there is no billing-side blocker. **Still open** — the
enum amendment did NOT rename it (`stripe_price_id` remains in the migration + `PlanSchema`).

## 3. Webhook route must not mount the fixture provider in prod (→ apps/web, SECURITY)

`processPaymentEvent` applies a REAL plan grant for any verified `payment_succeeded` event,
regardless of `mode`. The fixture provider signs with a **hardcoded default HMAC secret** and
emits `mode:'fixture'` events — perfect for tests/demo, dangerous if reachable in prod. Whoever
mounts the payment-webhook route (apps/web) MUST:

- select the provider by environment — mount ONLY the live rail (Cashfree/Stripe) in production,
  never the fixture;
- inject the provider's real webhook secret from env (never the fixture default);
- optionally reject `event.mode === 'fixture'` at the route when `NODE_ENV === 'production'` as
  defence in depth.

Billing keeps `mode` on every `CheckoutSession` / `ParsedWebhookEvent` precisely so the route can
enforce this. (H19 hardening item.)
