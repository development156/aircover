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

## 4. Cashfree credentials in `.env` are misconfigured (→ repo owner, BLOCKING live verification)

`CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` are set to the **same value**. Every Cashfree call
returns `401 request_failed: authentication Failed`.

Verified without printing either secret: both are 40 chars, ~72% digits, byte-identical, and
neither carries the `cfsk_ma_test_` prefix a real sandbox secret key uses. The App ID appears to
have been pasted into both slots.

**Fix:** Cashfree dashboard → Developers → API Keys, with the environment toggle on **Sandbox**;
set `CASHFREE_SECRET_KEY` to the secret value (distinct from the App ID).

**Consequence until fixed:** `order_tags` echo is **UNVERIFIED**. It is the only carrier of
workspace/plan/period from checkout into the webhook, and it is confirmed by Cashfree's own SDK
types but by no published example. The `GET /orders/{order_id}` fallback (`resolveWebhookEvent`)
means the rail works either way — that is why it was built rather than assumed — but the primary
path stays unproven. Run `CASHFREE_LIVE=1 pnpm --filter @sahoda/billing test` once corrected.

## 5. `.env.example` is missing every `CASHFREE_*` key (→ repo owner)

`CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` exist in `.env` but not in
`.env.example`, so a fresh clone cannot configure the rail. Billing does not edit `.env*`
(CLAUDE.md: do NOT touch), so it is specified here. Suggested entries, matching how
`STRIPE_SECRET_KEY` is templated:

```sh
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_ENV=sandbox   # 'sandbox' | 'live' — REQUIRED, never defaulted (see below)
```

`CASHFREE_ENV` is deliberately required with no default: Cashfree's sandbox and production
credentials are structurally identical, with no prefix distinguishing them, so nothing downstream
can detect a production key aimed at the wrong host. The env var is the only available guard, and
`baseUrl` is derived from it rather than configured so the two cannot disagree.

## 6. Checkout bridge route (→ apps/web)

`createCheckout` returns `CheckoutSession.url` pointing at `\${appBaseUrl}/billing/checkout/{orderId}`
plus a `sessionId`. That route does not exist yet and apps/web must add it: a minimal page that
loads `cashfree-js` and calls `cashfree.checkout({ paymentSessionId, redirectTarget: '_self' })`.

Why a bridge rather than a direct redirect: Cashfree publishes **no documented hosted-checkout
URL**. Create Order returns only a `payment_session_id` intended for the browser SDK. The
`POST /pg/view/sessions/checkout` pattern that dominates search results appears in no official
documentation (and is a form POST, not a redirect), so it is deliberately not used. Payment Links
(`POST /pg/links`) do return a real `link_url`, but emit `PAYMENT_LINK_EVENT` with no
`cf_payment_id`, no `order_tags`, and a Cashfree-generated `order_id` — a rewrite of the whole
webhook→ledger pipeline in exchange for a URL. Orders + a bridge keeps the pipeline intact.

The route must pass the webhook body as **raw text** (`await req.text()`) to
`verifyWebhookSignature`, never a re-stringified parse: JSON round-tripping reorders keys and
normalizes numbers (`1.80` → `1.8`), which silently breaks the HMAC.

## 7. Promote billing-internal contracts to `@sahoda/shared` (post-Alpha, ruling #2)

Billing-internal for Alpha, to be promoted alongside `PaymentProvider`:

- `PeriodSchema` / `currentPeriod` (`src/period.ts`) — the `YYYY-MM` grant replay anchor.
- `Transport` / `fixtureTransport` / `routedTransport` / `fetchTransport` (`src/transport.ts`) —
  currently **duplicated** from `packages/publishing/src/transport.ts` by copy, because billing
  depending on publishing would couple two unrelated domains for a ~40-line port.
