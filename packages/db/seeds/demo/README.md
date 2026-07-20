# Chai & Chapters demo seed

A complete, self-consistent demo workspace: a bookshop-café in Cuttack, Odisha, with a Brand
Brain, eight posts across X / GBP / Instagram, a generated site, a planner, a wallet with a
real ledger story, and an ops trail. It exists so the product can be walked through end to
end without hand-building state, and so screenshots and Playwright runs have something
stable to point at.

## Commands

```bash
pnpm --filter @sahoda/db seed:demo            # create it
pnpm --filter @sahoda/db seed:demo:destroy    # remove it
```

Both need `SUPABASE_DB_URL` (the direct Postgres connection string) in the repo-root `.env`:
the seed calls `app.apply_ledger_entry()`, which is service-role-only and not exposed
through PostgREST, so the direct connection is required, not preferred. Without it both
commands refuse and exit non-zero. The whole seed runs in ONE transaction — if any module
throws, nothing is written.

## Re-running, and why the demo ages

Re-running is safe and is a true no-op. Every id derives from a fixed label, so a second run
updates the same rows rather than creating a second demo, and **the run clock is pinned to
the first seeding**: `runSeed` reads back `workspaces.settings->>'seeded_at'` and hands that
instant to every module, so no timestamp moves.

The pinning is not a nicety. Without it a re-run after a month boundary mints a new
`monthly_grant` idempotency key, applies a _second_ 1500-credit grant, fails the ledger's
closing assertion and rolls back — working all month, then breaking permanently. It also
keeps the mutable tables in step with the four append-only ones (`credit_ledger`,
`post_publish_logs`, `audit_logs`, `ai_provider_logs`), which are `do nothing` on conflict.

The cost is that the demo's relative timing ages: "published 3 days ago" was true on the
day of the first seeding and drifts a day further into the past every day after. The seed
prints how old the pinned clock is on every run. To reset the story to today:

```bash
pnpm --filter @sahoda/db seed:demo:destroy && pnpm --filter @sahoda/db seed:demo
```

That is the supported way to refresh the timeline — there is no flag for it, because a
re-seed that quietly re-dated the story is the bug the pinning prevents.

**Do not run seed and destroy against the same namespace concurrently.** Destroy's `DELETE`
blocks on the seed's row lock, then succeeds once the seed commits — so the seed prints a
full success summary, row counts and credit balance, for a workspace that no longer exists.
Nothing is corrupted and no real data is touched; the operator is simply misinformed.

## What it seeds

| area        | rows                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| workspace   | workspace, members, owner profile, subscription, Brand Skin theme, tour progress |
| brand       | 2 `brand_memory` versions (v2 active), 2 writeback `memory_events`               |
| content     | 8 posts, 17 variants, 2 media, 6 publish logs                                    |
| site        | 1 site, 2 pages, 9 sections, 3 leads                                             |
| connections | 2 connections (X, GBP)                                                           |
| planner     | 9 events, 3 soft-linked to posts                                                 |
| wallet      | 22 `credit_ledger` entries, 1 balance                                            |
| ops         | 10 audit logs, 7 AI provider logs                                                |

The wallet ends at **1388 credits available, 0 held**. The ledger module computes that from
`PRICING` / `PLAN_CATALOG` and throws if the numbers disagree — a wallet demo showing a
wrong balance is the one thing this must never do.

## Seeing it as a signed-in user

The seed's owner is a synthetic id (`demo_seed_chai-and-chapters`) that no Clerk session
will ever match, and RLS reads `workspace_members` — so a real signed-in user sees nothing
unless they are a member. Set `SEED_DEMO_MEMBER_IDS` in the repo-root `.env` to a
comma-separated list of real Clerk subjects (`user_2abc...,user_2def...`) and re-run.

Each is added as an `owner` and gets every Alpha tour marked completed, so no onboarding
spotlight fires mid-walkthrough. Their `users_profile` rows are never written or deleted by
this seed — those belong to real people.

## `--namespace`

```bash
pnpm --filter @sahoda/db seed:demo --namespace=e2e-run-1
pnpm --filter @sahoda/db seed:demo:destroy --namespace=e2e-run-1
```

The namespace is mixed into every generated uuid, the workspace slug and the owner id, so a
namespaced run is a wholly disjoint workspace that cannot collide with — or be deleted
alongside — the real demo. Use it for tests and throwaway runs; omit it for the shared demo.

`--quiet` suppresses all output on both commands.

## How to tell this apart from real data

`workspaces.settings->>'demo_seed'` is exactly `sahoda:demo:chai-and-chapters`.

That marker is the whole safety story for teardown. `destroy` computes one workspace uuid
from the namespace, selects that row, and deletes it only if the marker matches exactly —
never by pattern, prefix, or `LIKE`. A missing row reports "nothing to delete" and exits 0;
a present row with the wrong marker throws and deletes nothing. On a shared dev database a
too-broad delete destroys someone's real workspace, so there is no widening switch here.

Deleting the workspace cascades to every tenant-scoped table. `users_profile` has no
`workspace_id` and no FK, so destroy deletes the synthetic owner's profile by exact id on
BOTH the deleted and the "nothing to delete" path — otherwise a workspace removed by another
route strands a row that neither the cascade nor the fixture sweep can ever collect.

Beyond the marker the data announces itself: the workspace is named "Chai & Chapters
(Demo)", every ledger entry carries `meta.demo = true`, and every connection's
`external_account` jsonb carries `"demo": true`.

## Honesty rulings

The demo is allowed to be rich. It is not allowed to lie about what the product did.

- **The site is `draft`, not `published`.** `deploy` and `last_deployed_at` are null.
  Cloudflare deploy is deferred in the product; a published site with a live-looking
  `*.sahoda.site` URL would be a mock-success state. It still renders fully in the in-app
  preview, which is what the demo shows.
- **No `connection_secrets` rows, and `expires_at` is null.** Both connections exist with no
  tokens at all — not fake, not real — so there is nothing to expire. An `expires_at` 45
  days out fabricates a property of a credential that does not exist, and "X, active,
  expires in 45 days" sends a presenter into a publish that dies on an empty vault.
- **Every `post_publish_logs` row is `mode = 'fixture'`.** Nothing was ever published;
  the honesty flag says so on every row.
- **Instagram variants are `skipped`, not `published`.** Instagram is `publishable: false`
  in Alpha (`CONSTRAINTS` in `@sahoda/shared`), so publishing one would be a fabricated
  success. They carry composed copy and a computed `char_count`, and stop there.
- **The failed image generation is real.** The ledger holds credits, the generation fails,
  and the RELEASE returns every credit — the user is not charged, and the provider cost we
  ate stays recorded. That pair exists so the wallet can prove on screen that users never
  pay for failures.
- **Variant bodies are validated.** Every `char_count` is computed with `charCountFor()` and
  checked with `validateVariant()`; the seed throws rather than write a variant that breaks
  its own platform spec.

## Known limitation: every ledger entry shares one timestamp

All 22 `credit_ledger` rows carry the same `created_at`, while `audit_logs` and
`ai_provider_logs` span 20 days — so the wallet shows the signup grant as "just now" beside
an audit trail dating signup to three weeks ago. Said out loud here, not left to be found.

`app.apply_ledger_entry` is the only write path to `credit_ledger` and exposes no
`created_at` parameter; the column defaults to `now()`. Staggering them means writing the
ledger directly, breaking the one rule the ledger has, or migrating a sacred function to
suit a demo. Neither is worth it.

Ordering survives: `credit_ledger.seq` is monotonic and holds the true story order (signup
grant → monthly grant → debits → the failed-image HOLD/RELEASE pair → the held variant pair
→ the reward). A wallet sorting by `seq` renders it correctly.
