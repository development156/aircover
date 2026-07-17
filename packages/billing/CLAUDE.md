# packages/billing

`withCredits()` wraps every AI mutation: entitlement gate → HOLD → run → DEBIT on success /
RELEASE on failure. Users never pay for failures; partial batches charge completed units only.

- Prices come ONLY from `pricing.config.json` via `creditCost()` (`@sahoda/shared`). Never
  hardcode a credit cost.
- The ledger is mutated ONLY through `app.apply_ledger_entry()` — this package calls it, never
  writes `credit_ledger`/`credit_balances` directly.
- Webhooks are idempotent by event id (`billing_webhook_events`). Test-mode only until backlog
  #8. Costs are shown before spend.
