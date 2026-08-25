# 54 — The Marketing Brain, built

Status: built, gated, and waiting on one migration. Supersedes nothing; it is the
record of what docs/53's build order actually produced.

The founder lifted the hold on 2026-08-25: "lets start building marketing brain,
apply it and report."

## What shipped

The whole vertical slice for one observation kind, end to end.

| Piece                                            | Where                                                     |
| ------------------------------------------------ | --------------------------------------------------------- |
| The contract                                     | `packages/shared/src/brain/observations.ts`                 |
| The table                                        | `packages/db/supabase/migrations/20260825000000_…sql`       |
| The computer                                     | `apps/web/src/lib/brain/observe/tone-drift.ts`              |
| The store                                        | `apps/web/src/lib/brain/store.ts`                           |
| The weekly pass                                  | `apps/web/src/lib/brain/run.ts`                             |
| The cron                                         | `apps/web/src/app/api/cron/brain/route.ts`, `30 21 * * 0`   |
| The read                                         | `apps/web/src/lib/brain/read.ts`                            |
| The block on /report                             | `apps/web/src/components/brain/observation-note.tsx`        |
| The operator's window                            | `apps/web/src/app/admin/brain/page.tsx`                     |
| The mesh provider                                | `packages/mesh/src/market-context.ts`                       |
| Wired to one task                                | `plan_week`, `wantsMarketContext: true`                     |

## The four decisions worth keeping

**1. No model call, anywhere in the computation.** `tone-drift.ts` imports no
mesh and holds no port, exactly as `lib/loop/reflect.ts` does and for the reason
that file states: a claim about the customer's own business is the one class of
statement this product may never invent, because a fabricated one reads exactly
like a true one. Every number in a claim is a count of characters in text the
customer published. The database comment on `claim` says so too, so the
guarantee survives someone reading only the schema.

**2. The floors are the feature.** Counting exclamation marks is trivial. Knowing
when the count is worth saying is the whole thing. Four gates, each with a
different failure it prevents: five posts per arm (three captions is one campaign
in one mood), twenty-one days end to end (a drift inside a fortnight is a
fortnight), a baseline rate of 0.5 (you cannot stop doing something you barely
did), and a 60% move (well above reflect's 0.25, because the cost of being wrong
is a customer deciding the product does not know them). Each returns the REASON
rather than a softer claim.

**3. Brand above market, in the prompt, in that order.** docs/51's arbitration
rule made mechanical: `plan-week.ts` puts the Brand Brain block before the
Marketing Brain block, and a test pins the order. Reading order is the cheapest
way to tell a model which one wins.

**4. Written by the job, read by the member, inspected by the operator.** One
SELECT policy for members, one for `app.is_ops_admin()`, and no write policy for
anybody. A customer who could insert a row could put a fabricated "Sahoda
noticed" sentence in front of their own team. The operator policy exists because
the store is hidden from customers by design, so /admin is the only window onto
it, and `post_publish_logs` is the standing lesson about what an unobservable
table costs.

## Guards, and the mutants they were shown to catch

Nineteen mutations were run against the new guards and every one went red.

- tone-drift (6): each of the four floors moved past its boundary, the arms
  overlapped so the middle post counts twice, and the "stopped" claim collapsed
  into the vaguer "fewer".
- the table (5): the SELECT policy unscoped, a member write policy added, the
  unique key losing `subject`, the evidence check dropped, the operator policy
  removed, and the operator policy widened from SELECT to ALL.
- the mesh provider (3): the workspace filter dropped from the URL (the tenant
  boundary), the do-not-quote instruction removed, an empty result yielding a
  block anyway.
- plan_week (2): market placed above brand, and `wantsMarketContext` removed.
- the weekly pass (5): failures folded into declines, decline reasons collapsed
  to a total, a refresh counted as an insert, one workspace's throw ending the
  pass, and `computed_on` taken from local time instead of UTC.

One mutation did NOT go red and the reason is worth recording: removing
`alter table … enable row level security` changes nothing, because
`20260801000000_rls_auto_enable.sql` installs an event trigger that enables RLS
on every new public table. Verified directly rather than assumed — `relrowsecurity`
stays true with the line deleted. The explicit line stays, because that migration's
own header calls itself a backstop and not a substitute.

## What the repo's own guards caught, unprompted

Adding one table turned six existing suites red, each naming the thing to do.
This is the part worth reading if you are adding a table next:

- `data_handling_doc` — docs/38 must name every workspace-owned table, and state
  the count. 48 became 49.
- `export_manifest` — a table carrying `workspace_id` and absent from the DPDP
  export is missing from every export.
- `rls_tenant_isolation` — the operator-only set is NAMED, not derived, so an
  operator policy is a decision somebody makes rather than a side effect.
- `erasure` — the proof cannot run with an unseeded tenant table.
- `wiring.test.ts`, `middleware.test.ts`, `middleware.coverage.test.ts` — a cron
  with a schedule and no Clerk exemption is the shape where the heartbeat reports
  green while every tick is a 307 to /sign-in.
- `read-waterfall` and `js-budget` — a new route with no recorded baseline is a
  failure, not a pass.

The seeder needed a `SHAPE_OVERRIDES` entry: its only jsonb rung is `'{}'`, which
is precisely the value the evidence check exists to reject.

## The two things not done, and why

**The migration is not applied.** REQUESTS.md §24. There is one live database and
no staging, so `supabase db push` is a founder action. Everything above the table
is built and gated; until it runs, the three surfaces render their read-failed
arms, which is the honest state.

**The smoke leg was not run.** REQUESTS.md §25. Playwright's Chromium cannot make
any outbound HTTPS request in a claude.ai/code sandbox — `https://example.com/`
resets identically to Clerk's host — and every @smoke spec signs in through
Clerk. The first diagnosis here said the cause was CA trust and it was wrong:
Chromium loads the agent proxy's own HTTP endpoint and plain-HTTP `example.com`
with 200, the proxy logs no attempt for any HTTPS one, and Playwright's Node-side
request context fetches the same URL fine from the same process. Outbound 443
from the Chromium process is reset before it reaches anything, which makes
`--ignore-certificate-errors` both forbidden and beside the point. Of the other four legs of
`pnpm gate`, three are green: 27 of 27 turbo tasks and `prettier --check .`
clean. The fourth, root vitest, has **two failures that no lane caused** —
`mutation-harness.test.ts` chmods a directory to `0500` and expects a write to be
refused, and this sandbox runs as uid 0, where root bypasses the bits. Verified
pre-existing on a clean tree at `cc2e5fb` and recorded as REQUESTS §26. An
earlier version of this section said four legs were green, which was wrong.

## Next, in the order docs/53 set

Step 1 is done and steps 2 and 3 are done with it. What remains:

4. **Draft capture.** Still the item with a clock on it: the edit overwrites the
   draft, so the rewrite history that the evidence-receipt and improvement-receipt
   moments both need is being destroyed every day it waits.
5. **The cohort line.** Last, deliberately. Strongest claim in the product, and
   the one with the privacy constraint that belongs in the schema rather than in a
   policy.
