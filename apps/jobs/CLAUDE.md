# apps/jobs

Idempotency key on every task. Retries exponential x3 on transient errors. **Nothing publishes
without a `post_publish_logs` row.**

- Task payload shapes come from `@sahoda/shared` (`PublishPostPayload`, `HoldSweepPayload`).
- Jobs use the Supabase service-role client (RLS bypass) — never expose it to client code.
- The expired-hold sweep releases stranded HOLDs via `app.apply_ledger_entry()` only.
- Trigger.dev fallback (if it fights back): Vercel cron + QStash with the same task signature.

## Scheduled-publish dispatcher (`src/dispatch/`)

Every 5 min. Finds posts inside the shared gate (`isDispatchable` — `approved|scheduled` with a
`scheduled_at`) whose time has come, then dispatches, settles or expires them.

- **`SAHODA_PUBLISH_DISPATCH_MODE`** = `off` (default) | `report` | `on`. `off` reads nothing.
  `report` classifies and writes nothing. Only `on` mutates. A set-but-invalid value refuses to
  start rather than falling back — absorbing `"true"` into the safe default would hide intent.
- **`SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS`** = 3600. How late a post may be and still publish;
  past it, the post expires instead of going out at the wrong hour.
- Neither belongs in `turbo.json` — that env list is `@sahoda/web#build`, and these are read at
  runtime by the jobs worker. They are also NOT in `.env.example` (`.env*` is do-not-touch).

Three rules that must not be relaxed:

1. **Never expire a post with a published variant.** Enforced twice — the classifier cannot emit
   `expire` when one exists, and `expirePost`'s statement carries a permanent
   `NOT EXISTS (published variant)` clause. Ordering fan-in first narrows the window; only the
   SQL clause closes it.
2. **The post status may not outrun the variant's recorded mode.** A `fixture` publish, or a
   `published` variant with no succeeded log to read a mode from, is held — never promoted to a
   plain `published` badge.
3. **Never move a dispatched post to `publishing`.** That drops it out of the gate, and a run
   that dies would strand it there forever. Re-dispatch is safe instead: the idempotency key
   `${postId}:${channel}:${scheduledAt}` collapses a repeat onto one platform post.
