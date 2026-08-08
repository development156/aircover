# apps/jobs

Idempotency key on every task. Retries exponential x3 on transient errors. **Nothing publishes
without a `post_publish_logs` row.**

- Task payload shapes come from `@sahoda/shared` (`PublishPostPayload`, `HoldSweepPayload`).
- Jobs use the Supabase service-role client (RLS bypass) — never expose it to client code.
- The expired-hold sweep releases stranded HOLDs via `app.apply_ledger_entry()` only.
- Trigger.dev fallback (if it fights back): Vercel cron + QStash with the same task signature.
- **Nothing in here runs on Trigger.dev today.** No deploy has ever been made from this repo.
  Both sweeps run from `apps/web/src/app/api/cron/sweeps/route.ts` on a Vercel cron instead,
  importing `@sahoda/jobs/sweeps` — the entry point that excludes the SDK. `publishPost` and
  `plan-week` have no runner at all yet.

## Scheduled-publish dispatcher (`src/dispatch/`)

Every 5 min. Finds posts inside the shared gate (`isDispatchable` — `approved|scheduled` with a
`scheduled_at`) whose time has come, then dispatches, settles or expires them.

- **`SAHODA_PUBLISH_DISPATCH_MODE`** = `off` (default) | `report` | `on`. `off` reads nothing.
  `report` classifies and writes nothing. Only `on` mutates. A set-but-invalid value refuses to
  start rather than falling back — absorbing `"true"` into the safe default would hide intent.
- **`SAHODA_HOLD_SWEEP_MODE`** = `off` (default) | `report` | `on`, same three states and the
  same refusal on an invalid value. The reaper had no off switch before this; deploying it
  anywhere would have started moving credits on the first tick.
- **`SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS`** = 3600. How late a post may be and still publish;
  past it, the post expires instead of going out at the wrong hour.
- All four now ARE in `turbo.json`'s `@sahoda/web#build` list, alongside `CRON_SECRET`. That was
  wrong to omit once apps/web became the runner: the sweeps are invoked from a Next.js route, so
  `@sahoda/web` is the build that has to know about them. They stay out of `.env.example`
  (`.env*` is do-not-touch); set them in the Vercel project env.

**The expiry reason is not persisted.** `expirePost` runs one `update posts set status='expired'`
and writes nothing else; `post_publish_logs` cannot hold it (`channel` and `mode` are NOT NULL, and
a no-variants expiry has neither), and `posts` has no reason column. `past-grace` vs
`no-variants-past-grace` lives only in the sweep's return value — the task run output. Anyone
auditing why a post expired reads the run, not the row.

**The dispatcher publishes from the cron route only behind a claim.** With no queue,
`enqueuePublish` throws `PublishQueueUnavailableError` and the sweep counts it as
`queueUnavailable` — not `failed`, because nothing was attempted. Where publishing IS enabled
(`SAHODA_PUBLISH_ENABLED`, separate from the dispatch mode), `runClaimedPublish` takes a CAS
claim first: `claimVariant`'s single conditional UPDATE sets `publish_status = 'publishing'`
and `publish_claimed_at`, so of two overlapping cron ticks exactly one owns the variant. That
claim is the only thing making an inline publish safe — Vercel documents that cron delivery
can both duplicate and miss invocations, and Trigger.dev's `idempotencyKey` is not in play on
this rail. See REQUESTS.md.

Five rules that must not be relaxed:

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
4. **`publish_status = 'publishing'` must stay claimable once the lease has lapsed.** The
   variant-level form of rule 3, and it was broken from the day the claim shipped: `claimVariant`
   sets `publishing` but its status list excluded `publishing`, so `publish_claimed_at < now() -
lease` could only ever be tested against rows nobody had claimed. A publisher killed mid-flight
   stranded its variant permanently. Both halves are proven by execution in
   `src/publish/lease.pglite.test.ts` and pinned by `mutations/publish-lease.mjs` — a live claim is
   still refused, only a dead one is taken over, and `published` is never re-claimed.
   **This trades a guaranteed strand for a narrow duplicate**, and the trade is not closed: a
   process that died between the platform's 200 and its `post_publish_logs` INSERT leaves a live
   post no query can find, and the re-claim publishes it again. The deterministic `requestId`
   does not save it — doc 13 §5 puts Zernio's window at ~5 minutes `[DOC]`, and the lease is ten.
   Read SL-069 before flipping `SAHODA_PUBLISH_ENABLED`.
5. **A sweep may not hide its own failure.** No `catch {}`. Every failure is classified where it is
   caught, counted by kind, and the pass reports `clean` / `degraded` / `failed` — a pass where
   every unit threw used to be indistinguishable from an idle tick. The report is returned on a
   public URL by apps/web's cron route, so it carries codes and counts only: never `error.message`,
   never a row id. The real cause goes to `onFailure`. See `src/reconcile/failures.ts` and
   `mutations/reconcile-failures.mjs`.
