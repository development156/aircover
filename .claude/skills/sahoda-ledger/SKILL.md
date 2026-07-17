---
name: sahoda-ledger
description: Use for anything touching credits — charging an AI action, grants, top-ups, refunds, wallet UI, or the apply_ledger_entry Postgres function.
---
Flow for every AI action: HOLD (before model call, idempotency_key = `${action}:${object_id}:${attempt}`) → on success convert to DEBIT with {action_type, object_ref, model_tier, cogs_usd_est} → on failure RELEASE. Users are never charged for failures; partial batches charge completed units only.
All entries go through `apply_ledger_entry()` in ONE transaction with `SELECT ... FOR UPDATE` on the balance row. Entry types: GRANT|DEBIT|HOLD|RELEASE|TOPUP|PERF_REWARD|EXPIRE|ADJUST. Prices come from `pricing.config.json` via shared — never hardcode credit costs. Server actions wrap with `withCredits(action, cost, fn)`. Add/extend the concurrency property test when touching the fn.
