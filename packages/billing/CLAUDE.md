# packages/billing

`withCredits()` wraps every AI mutation: HOLD → run → DEBIT on success / RELEASE on failure.
Users never pay for failures; partial batches charge completed units only.

The entitlement gate (`checkEntitlement`) is a **separate helper called BEFORE `withCredits`** at
each AI entry point (owner ruling #5) — deliberately NOT inside the wrapper. It takes
`workspaceId` explicitly and reads no request-scoped context, because it must also run from
apps/jobs (Trigger.dev — no Clerk `auth()`, no cookies). It is **shipped but not yet mounted** —
zero call sites today, so plan limits constrain nothing until apps/web wires it. It is also **not
atomic**: it compares caller-supplied `currentUsage`, so callers must count inside the inserting
transaction (REQUESTS §8).

- Prices come ONLY from `pricing.config.json` via `creditCost()` (`@sahoda/shared`). Never
  hardcode a credit cost.
- The ledger is mutated ONLY through `app.apply_ledger_entry()` — this package calls it, never
  writes `credit_ledger`/`credit_balances` directly.
- Webhooks are idempotent by event id (`billing_webhook_events`). Test-mode only until backlog
  #8. Costs are shown before spend.
- `period` is always `YYYY-MM` (`PeriodSchema`). It is the sole grant replay anchor inside
  `monthlyGrantKey`, so two spellings of one month = two grants. Enforced at the grant boundary.
- Outer catches return **fixed** error strings — apps/web renders `error.message` as customer
  copy. Raw causes go to the optional `onError(cause, traceId)` hook, never onto the Result.
- Cashfree: verify the signature over the **raw** body (`await req.text()`); a re-stringified
  parse normalizes `1.80` → `1.8` and breaks the HMAC. `order_tags` carry workspace/plan/period.
