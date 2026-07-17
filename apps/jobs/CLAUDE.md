# apps/jobs

Idempotency key on every task. Retries exponential x3 on transient errors. **Nothing publishes
without a `post_publish_logs` row.**

- Task payload shapes come from `@sahoda/shared` (`PublishPostPayload`, `HoldSweepPayload`).
- Jobs use the Supabase service-role client (RLS bypass) — never expose it to client code.
- The expired-hold sweep releases stranded HOLDs via `app.apply_ledger_entry()` only.
- Trigger.dev fallback (if it fights back): Vercel cron + QStash with the same task signature.
