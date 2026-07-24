# packages/billing phase 2 — Cashfree sandbox · entitlements gate · carry-forward hardening

**Date:** 2026-07-19 · **Lane:** wt-billing · **Base:** `26ad8c3` (billing core merged to main)
**Baseline:** 48/48 tests green, real-DB integration tests running (not skipped).

Scope is confined to `packages/billing`. Cross-package needs are filed in `REQUESTS.md`, never
faked and never edited from this lane.

---

## 0. Owner rulings taken this session

| # | Question | Ruling |
|---|---|---|
| R1 | Cashfree signs `timestamp + rawBody`; the verify seam has no timestamp slot | **Optional 3rd param** — `verifyWebhookSignature(rawBody, signature, meta?)`. Non-breaking; fixture ignores `meta`. |
| R2 | Webhook carries no workspace/plan/period | **`order_tags` round-trip** — set at create-order, read back from `data.order.order_tags`. |
| R3 | Gate shape | **Dimension + usage count** — `checkEntitlement({ workspaceId, dimension, currentUsage })` → `Result`. |
| R4 | Live sandbox test gating | **Skip-unless-env** — `describe.skipIf(!CASHFREE_APP_ID)` in `*.live.test.ts`. |

Standing rulings that constrain this work: **#2** `PaymentProvider` stays billing-internal for
Alpha; **#5** entitlements are a separate gate called BEFORE `withCredits`, never inside it.

---

## 1. Frozen contracts this work must satisfy

Verified verbatim from source during recon:

- `PaymentProvider` — `createCheckout` is async; `verifyWebhookSignature` and `parseWebhookEvent`
  are **synchronous** and `parseWebhookEvent` **throws** rather than returning a `Result`.
  Synchronous verification forces `node:crypto` `createHmac`, not `crypto.subtle`.
- `LedgerPort` (`apply` / `latestHold` / `balance`) — the gate must **not** extend it; the gate has
  no ledger concern and gets its own port.
- `WebhookEventStore` (`claim` / `markProcessed` / `markFailed`) — unchanged by this work.
- `app.apply_ledger_entry` — there is **no `SETTLE` entry type**; settlement is a `DEBIT` or
  `RELEASE` carrying `settles_entry_id`. Grant replay anchor is
  `monthlyGrantKey(plan, period, workspaceId)` → `grant:${plan}:${period}:${workspaceId}`.
- `ENTITLEMENT_ERROR` already exists in the shared error taxonomy with **zero callers** — the gate
  is its first consumer. No `@sahoda/shared` change needed.
- DB provider CHECK on `billing_webhook_events` / `subscriptions` already includes `'cashfree'`
  (migration `20260718193834`) — **no migration required by this lane.**
- `subscriptions`: partial unique index `subscriptions_one_live` covers only
  `('trialing','active','past_due','grace')`. **No row ⇒ Free.** Dead `suspended`/`canceled` rows
  can accumulate, so the resolver filters on the live set — never `order by created_at limit 1`.

---

## 2. Work item A — the period format contract

**Problem (carry-forward, MEDIUM):** `period` is the sole grant replay anchor inside
`monthlyGrantKey`, yet it is validated only as `z.string().min(1)`. `'2026-7'` and `'2026-07'`
produce different idempotency keys for the same month — a double-grant vector the moment two code
paths disagree on formatting.

**Contract:** `period` is ISO-8601 year-month, zero-padded, exactly `YYYY-MM`. Months `01`–`12`.
Nothing else parses.

**New file `src/period.ts`:**

```ts
/** Billing period: ISO-8601 year-month, zero-padded. The sole grant replay anchor. */
export const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM')
export type Period = z.infer<typeof PeriodSchema>
export function currentPeriod(now: Date): Period   // UTC-derived
export function isPeriod(v: unknown): v is Period
```

**Enforcement points:** `FixturePayloadSchema.data.period`, the Cashfree tag parse, and a guard in
`applyPlanGrant` before `monthlyGrantKey` is built. Enforcing at the grant boundary is what
actually closes the vector — the providers are merely the first line.

**Placement note:** this belongs in `@sahoda/shared` long-term, but that is another lane's file and
scope here is `packages/billing`. It ships billing-internal under the same precedent as ruling #2
(`PaymentProvider` is billing-internal for Alpha) and is filed in `REQUESTS.md` for promotion.

**UTC decision:** `currentPeriod` derives from UTC, not local time. A server in IST would otherwise
roll the period ~5.5h early and mint a second grant key for the same billing month.

---

## 3. Work item B — fixed error strings at outer catches

**Problem (carry-forward, MEDIUM):** `withCredits` leaks raw internal messages into a user-facing
`Result` at two points, while `applyPlanGrant` already does this correctly
(`'Could not apply plan grant'`, with the comment "The message is fixed so no DB internals leak").

| Site | Today | Becomes |
|---|---|---|
| `withCredits.ts:98` (wrapped-fn failure) | `messageOf(runErr)` | `'Could not complete the action'` |
| `withCredits.ts:119-121` (outer backstop) | `messageOf(unexpected)` | `'Could not complete the action'` |
| `processPaymentEvent.ts:63` (outer backstop) | `messageOf(unexpected)` | `'Could not process the payment event'` |

`withCredits.ts:77` already uses a fixed string (`'Could not reserve credits'`) — that one is the
model to follow.

This is load-bearing, not cosmetic: `brand-resolve.ts:174` puts `credits.error.message` **directly
into user-facing copy**, so today a thrown `'MESH_ERROR'` sentinel is rendered to the customer.

**Preserving debuggability.** Fixed strings alone would leave a production `PROVIDER_ERROR` with a
traceId and nothing else. To avoid trading one defect for another, both factories gain one optional
dep:

```ts
/** Server-side observability hook. The raw cause never crosses the Result boundary. */
onError?: (cause: unknown, traceId: string) => void
```

Called in the catch, wrapped so a throwing hook cannot corrupt the result path. Default is a no-op —
no logger dependency added, no `console.*` in library code.

---

## 4. Work item C — the entitlements gate

Ruling #5: a **separate** helper called BEFORE `withCredits`, never inside it.

### Call-site constraints (from recon, both are hard)

1. The only current call site (`brand-resolve.ts:134`) has `workspace.id` but **no plan id** —
   `WorkspaceOption` is `{id, name, slug}`. The gate must resolve the plan itself.
2. Ruling #5 says "every AI entry point", and a second one exists in **apps/jobs**
   (`plan-week.ts`, Trigger.dev — no Clerk `auth()`, no cookies). The gate therefore takes
   `workspaceId` **explicitly** and must never touch request-scoped context.
3. `withCredits` never rejects. The gate honours the same contract — returns `Result`, never throws —
   or the two halves of each call site need different error handling.

### Design

```
src/entitlements/
  port.ts             PlanResolverPort { resolvePlanId(workspaceId): Promise<PlanId> }
  pg.ts               createPgPlanResolver({ connectionString }) — live-status subscriptions read
  checkEntitlement.ts createCheckEntitlement(port, deps) -> gate fn
```

```ts
export type EntitlementDimension = keyof PlanLimits   // channels|sites|seats|loopLevel|twinSize

export interface EntitlementCheckInput {
  workspaceId: string
  /** Which limit this action is about to consume. Omit for actions no limit constrains. */
  dimension?: EntitlementDimension
  /** Caller-supplied current usage. Omitted ⇒ presence check only. */
  currentUsage?: number
}

export interface EntitlementCheck {
  planId: PlanId
  limits: PlanLimits
  /** null when no dimension was checked. */
  limit: number | null
  allowed: boolean
}

// Result<EntitlementCheck> — ENTITLEMENT_ERROR when denied, PROVIDER_ERROR (fixed
// string) when the plan lookup itself fails. Never throws.
```

**Semantics.** Denial is `currentUsage >= limit` (consuming one more would exceed). `loopLevel` is a
*level*, not a count — the caller passes the level it wants as `currentUsage` and the check is
`requested > limit`. This asymmetry is explicit in the code and directly tested, because getting it
backwards silently grants a plan tier it shouldn't.

**Where limits come from.** `plan_id` is resolved from the DB (`subscriptions`, live statuses, else
`'free'`); the limit *values* come from `getEntitlements(planId)` — i.e. `PLAN_CATALOG`.

This is a deliberate reading of "reading plans.limits" and is flagged for the owner: `plans.limits`
jsonb is a **seeded fold of `PLAN_CATALOG`** (the schema comment calls it "D7 fold … Alpha reads,
never edits"), and `PlanSchema.limits` is typed as loose `JsonbSchema`, so a DB read would be
*unvalidated* jsonb where the catalog is a typed constant. Reading the catalog is both safer and
one fewer query. To ensure that is not a lie, work item C ships a **drift test** asserting the live
`plans` table rows equal `PLAN_CATALOG` — recon confirmed no such test exists today, so DB and code
can currently drift silently. If the owner wants the DB to be authoritative instead, that is a
one-line swap plus `PlanLimitsSchema.parse()` on the row.

### Tests (written first)

Unit (fake port): each dimension; boundary pairs (`usage == limit` denies, `usage == limit-1`
allows); `loopLevel` requested-vs-max direction; no-dimension passes; unknown workspace ⇒ `free`;
resolver throws ⇒ `PROVIDER_ERROR` with the fixed string and no leak.
Integration (real DB): no subscription row ⇒ `free` limits; a live `growth` row ⇒ growth limits; a
`canceled` row ⇒ falls back to `free` (proves the live-status filter); plus the seed-drift test.

---

## 5. Work item D — the Cashfree sandbox adapter

### Transport

No HTTP dependency exists anywhere in the repo and none will be added. `packages/billing/src/transport.ts`
mirrors `packages/publishing/src/transport.ts` (`Transport`, `fixtureTransport`, `routedTransport`,
`fetchTransport`). It is **copied, not imported** — billing depending on publishing would be a bad
coupling for a 30-line port. Duplication is recorded in `REQUESTS.md` for promotion to shared.

`routedTransport` **throws on an unmatched request**, so a missing fixture fails loudly instead of
silently returning a default — that property is why it is worth copying rather than hand-rolling.

### Environment

`loadBillingEnv()` gains an optional Cashfree block (absent keys are not an error — the fixture rail
must keep working with no Cashfree config):

```ts
cashfree?: { appId: string; secretKey: string; env: 'sandbox' | 'live'; baseUrl: string }
```

`baseUrl` is derived, never configured: `sandbox` → `https://sandbox.cashfree.com/pg`,
`live` → `https://api.cashfree.com/pg`. Recon flagged a real hazard here — **Cashfree sandbox and
production keys are structurally identical**, there is no prefix to tell them apart. So the env
loader asserts `CASHFREE_ENV` is one of the two literals and refuses to start on anything else,
rather than defaulting. All three `CASHFREE_*` names get added to `.env.example` (currently absent).
Values are never echoed, matching the existing loader's discipline.

### Signature verification

```
expected = base64( HMAC_SHA256( key = secretKey, msg = timestamp + rawBody ) )
```

Confirmed verbatim against official docs. Concatenation is timestamp first, raw body second, **no
separator**. Compared to `x-webhook-signature`; timestamp comes from `x-webhook-timestamp` via the
new `meta` param (R1). Length-guarded `timingSafeEqual`, exactly as the fixture does.

Two hardening points beyond the docs' minimum:

- **Raw body only.** Docs: *"Cashfree generates the webhook signature based on the raw payload, not
  the parsed payload."* Re-stringifying parsed JSON breaks the HMAC (`1.80` → `1.8`). The route must
  pass `await req.text()`. This is documented at the seam.
- **Timestamp freshness.** Cashfree does **not** do replay protection, and a captured signature stays
  valid forever. The adapter rejects a timestamp outside a ±5-minute window (configurable, injectable
  clock for tests).

### Event parsing

Webhook envelope is `{ data, event_time, type }`. Mapping:

| Normalized | Cashfree `type` |
|---|---|
| `payment_succeeded` | `PAYMENT_SUCCESS_WEBHOOK` |
| `payment_failed` | `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK` |
| `unknown` | anything else |

- `eventId` = `` `${type}:${data.payment.cf_payment_id}` ``. Cashfree sends no per-delivery event id,
  and retries redeliver the identical payload — so this is stable across the documented retry
  schedule (2, 10, 30 min) and unique per payment per event type. It is the
  `billing_webhook_events (provider, event_id)` key.
- `workspaceId` / `planId` / `period` come from `data.order.order_tags` (R2), zod-parsed, with
  `period` through `PeriodSchema`.
- **Missing tags throw.** `parseWebhookEvent` is synchronous, so it cannot fall back to a
  `GET /orders/{id}` fetch. A tagless event is a hard, honest failure — nothing is fabricated and no
  grant is applied. Live-sandbox proof that tags actually echo is a gating deliverable (§6).
- **Amount check.** `data.order.order_amount` is compared against `PLAN_CATALOG[planId].priceInr`;
  a mismatch throws. Defence in depth behind the signature. Note `payment_amount` may legitimately
  differ from `order_amount` (offers/discounts) — the check uses `order_amount`, the amount we set.

### Checkout

`POST {baseUrl}/orders`, headers `x-api-version: 2025-01-01`, `x-client-id`, `x-client-secret`,
`content-type: application/json`, plus `x-idempotency-key` (UUID). Body carries `order_id`,
`order_amount` from `PLAN_CATALOG[planId].priceInr`, `order_currency: 'INR'`, `customer_details`,
`order_meta.{return_url, notify_url}`, and `order_tags: { workspace_id, plan_id, period }`.

Idempotency: a duplicate `order_id` returns HTTP 409 `order_already_exists`, which fails safe but
loses the original `payment_session_id`. Sending `x-idempotency-key` instead replays the original
response — the same lost-ack failure mode already fixed in `withCredits`.

Errors are classified like `classifyXHttpError`: 408/429/5xx transient, everything else permanent;
the retained `detail` is the provider's own message truncated, and **never** the request headers —
`x-client-secret` must not be able to reach a log or an error field.

> **OPEN — blocking this sub-item only.** `CheckoutSession.url` requires a redirect URL, but Create
> Order returns `payment_session_id` with no hosted URL (it expects the `cashfree-js` browser SDK).
> A verification pass is running on whether a documented hosted-checkout URL exists, or whether the
> Payment Links API (`POST /pg/links`, which does return a real `link_url`) is the correct primitive —
> and critically whether links emit the same `PAYMENT_SUCCESS_WEBHOOK` shape. **No URL pattern will be
> invented.** If neither is confirmed, `createCheckout` returns the session id and the seam grows an
> explicit `sessionId` field rather than a fabricated `url`.

---

## 6. Live sandbox verification (R4)

`src/providers/cashfree.live.test.ts`, `describe.skipIf(!process.env.CASHFREE_APP_ID)`.

Proves against the real sandbox: credentials authenticate; create-order returns
`payment_session_id` + `order_status: 'ACTIVE'`; **`GET /orders/{order_id}` echoes the
`order_tags` we set** (the load-bearing R2 assumption); a duplicate `order_id` returns 409.

Sandbox rate limit is **30 create-orders/min** (6× tighter than prod), so live tests are serialized
and use unique order ids.

Webhook delivery itself is *not* asserted automatically: Cashfree cannot reach `localhost`,
`notify_url` must be HTTPS, and sandbox webhooks must be configured by hand in the dashboard
(Payment Gateway → Developers → Webhooks; sandbox and prod configs are separate). The end-to-end
webhook leg is a documented manual step whose captured real payload is committed as a fixture — so
the automated suite replays a genuine Cashfree body, not an invented one.

---

## 7. Commit sequence (tests-first, green at each step)

| # | Commit | Gate |
|---|---|---|
| 1 | `feat(billing): period format contract` | period tests green; existing 48 still green |
| 2 | `fix(billing): fixed error strings at outer catches` | leak tests green |
| 3 | `feat(billing): entitlements gate + pg plan resolver` | unit + real-DB + drift test green |
| 4 | `feat(billing): Transport port` | fixture/routed/fetch tests green |
| 5 | `feat(billing): Cashfree signature verification` | known-vector + freshness tests green |
| 6 | `feat(billing): Cashfree webhook parse` | recorded-payload tests green |
| 7 | `feat(billing): Cashfree createCheckout` | routedTransport tests green |
| 8 | `test(billing): Cashfree live sandbox` | live test passes locally, skips without keys |
| 9 | `docs(billing): LEARNINGS + REQUESTS` | — |

## 8. Out of scope / filed as requests

- Mounting the webhook route and gating the fixture provider out of prod (`REQUESTS.md` §3, apps/web).
  **This lane ships the rail; it does not mount it.** The fixture's hardcoded default HMAC secret
  remains a latent prod risk until that route gating lands.
- Wiring the gate into `brand-resolve.ts` and `plan-week.ts` (apps/web, apps/jobs).
- Promoting `PeriodSchema`, `PaymentProvider`, and `Transport` to `@sahoda/shared` (post-Alpha, ruling #2).
- Renaming `plans.stripe_price_id` → `provider_price_id` (wt-db, `[contract]`).
- The hold reaper — comments claim TTL auto-release but nothing implements it (carried residual risk).
