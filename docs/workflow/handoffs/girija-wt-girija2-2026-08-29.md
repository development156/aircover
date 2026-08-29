# Handoff — girija — wt-girija2 — 2026-08-29

**Branch** `wt-girija2` at `b57f93ca`. Lane `wt-girija2`. Pushed: **yes**, and
landed on `wt-core`. No PR: the lane merges directly, and `wt-core` now carries
this work.

**Two gated steps and one feature, all on the founder's explicit instruction:**
six migrations applied to production, `wt-core` promoted to `wt-web` **twice**,
and the signup door now seeds the knowledge library with the website it already
reads. Both promotions are live and serving.

> **This file was EXTENDED in place, not appended to with a `## Session 2`.**
> It is one continuous session: three questions, then the promotion, then the
> handoff, then the founder asked for the seed feature and a second promotion.
> The `## Session n` rule exists so two DIFFERENT sessions cannot overwrite each
> other; that is not what happened here, and inventing a boundary inside one
> session would be a false record. The git diff on this file is the honest
> account of what was added when.

---

## What shipped

One feature from this lane's own hand, and two promotions of the trunk.

| # | What | Proof | Covered by |
| - | ---- | ----- | ---------- |
| 1 | Six migrations applied to project `rloztdhzfliyvpvxsgjl` | `list_migrations` now carries `reprice_plans_from_business_model_deck`, `marketing_pass_runs`, `loop_reflect_reason`, `studio_designs`, `loop_autopilot_l3`, `loop_autopilot_log` | each table/column re-read over PostgREST after the fact — all seven checks OK |
| 2 | `wt-core` `28aae473` promoted to `wt-web`, fast-forward | `git push origin origin/wt-core:refs/heads/wt-web` → `e8867241..28aae473` | Vercel `dpl_CDjgLHuVu6y5Xp2zU5UM413yfXzn`, **READY**, built in 2m31s, aliased to `app.sahodalabs.com` |
| 3 | Knowledge grounding now in production | `packages/mesh/src/knowledge-context.ts` present on `origin/wt-web`; `caption_rewrite` and `content_variants` declare `knowledgeQuery` | `knowledge-context.test.ts` 14, `knowledge-injection.test.ts` 5, plus the mutation below |
| 4 | The Loop's Sunday cron can run again | `origin/wt-web:apps/web/src/lib/cron/run-loop.ts` no longer contains `from loop_autonomy`; `loop-facts-sql.ts` carries `loop_channel_autonomy` twice | wt-divas's `loop-facts-sql.pglite.test.ts` |
| 5 | Monday check-in armed | `trig_01TD9NJWMfepuLbnzPzVqAZ7`, fires 2026-08-31T09:00Z into this session | n/a |
| 6 | **The signup door seeds the library with the site it already read** | `b57f93ca`, `apps/web/src/lib/onboarding/seed-library.ts`, called from `app/api/onboarding/door/route.ts:89` | `seed-library.test.ts`, **10 tests**, three mutations below |
| 7 | `createThenIndex` / `indexFromSource` moved to a shared `server-only` module | `apps/web/src/lib/knowledge/ingest.ts`; `actions/knowledge.ts` now imports them | the four existing knowledge suites, 31 tests, unchanged and green |
| 8 | Second promotion: `wt-core` `b57f93ca` → `wt-web`, fast-forward, **0 migrations** | `28aae473..b57f93ca` | Vercel `dpl_9eG9LighuvE54Qs4LsGUAKdLENsV`, **READY**, 2m07s |

**Item 6, stated exactly.** The door already crawls up to five pages and hands
the text to `brand_extract`, then discarded it. It is now also written to the
library through the same `createThenIndex` the three visible doors use, so the
row is indistinguishable from one a person added. **No second fetch, no model
call, no credit** — and RICHER than the same site added by hand, because
`readUrlSource` fetches one page and the door crawls five. Seeded only when
`result.kind === 'url'`: with a PDF also supplied the door returns the PDF text,
and seeding then would store the wrong thing under the right address.

**MEASURED, live product after the promotion:** `/sign-in` 200. `/` and `/home`
return 404 to a signed-out client — **identical on the PREVIOUS production
build**, checked side by side, so it is Clerk's middleware and not a regression.

---

## What was NOT done, and why

- **No screen was seen by anyone.** Chromium in this sandbox reaches loopback and
  nothing else (probe verdict `LOCAL_ONLY`; `http://example.com/` and
  `https://example.com/` both reset). The Playwright leg is **UNRUN, not passed**.
  Nobody has looked at the live product since it changed. The plans screen in
  particular needs a human.
- **The Instagram document was NOT deleted.** The founder asked; I declined the
  method, not the request. It is a real customer row and the safe delete is
  `delete_knowledge_document`, which counts citations and requires a member
  identity. Doing it over the service key from here would go round the product's
  own guard. It is one click on `/brain/knowledge`.
- **The near-empty-page refusal is HALF done, and the half that is missing is
  the one a person can reach.** `MIN_SEED_CHARS = 200` guards the seed nobody
  asked for. The library's own URL door still accepts any page with one
  non-whitespace character (`read-source.ts:90` is untouched), so a person can
  still add a login wall by hand and see it badged `Indexed`. Deliberate: the
  automatic path must be more cautious than the chosen one, and widening the
  manual door's floor is a separate change with its own copy. Design in "Next
  session".
- **Nobody has watched a real signup.** The seed is proven by unit tests and by
  three mutations, not by a person going through the door. The e2e onboarding
  specs were not run — same Chromium wall as everything else.
- **`seed-library.ts` has no e2e or PGlite coverage.** Its ingest call is
  injected and the test asserts the seam, not a real `create_knowledge_document`
  round trip. The RPC itself is covered by `knowledge_library.pglite.test.ts`
  (33 tests) through the manual doors, which is the same function — but nothing
  proves the SEEDED row end to end against real Postgres.
- **`ops/state/qa.pending.json` was discarded THREE times.** The QA logger
  appended `fail` rows for a scratch-folder vitest invocation and for my own
  deliberate mutation. Recording those as product failures would be a lie in the
  QA record. **This is a real defect in the logger** — see "Next session".

---

## Shared surfaces touched

**Two, both in `apps/web`, both additive. `packages/*` untouched.**

| Surface | Change | Who it affects |
| ------- | ------ | -------------- |
| `apps/web/src/app/actions/knowledge.ts` | `indexFromSource` and `createThenIndex` **moved out** to `lib/knowledge/ingest.ts`; `KnowledgeActionState` moved with them and is **re-exported** from the old path | **Nobody breaks.** `components/knowledge/add-document.tsx:8` imports the type from `@/app/actions/knowledge` and still resolves. Both functions were module-private, so no caller existed outside the file |
| `apps/web/src/lib/knowledge/ingest.ts` | **New** `server-only` module. The one path for every door | A fifth door must call this, not copy it |
| `apps/web/src/app/api/onboarding/door/route.ts` | One `await` added AFTER the `done` line is written | A lane changing the door stream must keep the seed after `done`: the customer's screen moves on at that line and the seed must not delay it |

**Why the move was NOT an export from the action file:** every export of a
`'use server'` file is a callable endpoint. Exporting these two to share them
would have published two endpoints taking `workspaceId` as an argument — a
tenant boundary handed to the caller — to save an import.

What OTHER lanes must also know is that the trunk they merge into is now the
production branch as well, and **six migrations that were file-only are now
applied**. A lane holding an unapplied assumption about any of those six —
particularly `loop_channel_autonomy.level <= 3` and the new autopilot trigger —
is now wrong.

---

## Contract, migration or money

**All three, and the money one is the one to read.** The seed feature adds
none of them: **no migration, no price, no ledger call, no credit.** It reuses a
read the door already paid for and calls no model. `pricing.config.json` gains
nothing and must not — there is nothing to charge for.

**Money.** `20260824200000_reprice_plans_from_business_model_deck` is applied AND
the code carrying the same numbers is live. MEASURED in the `plans` table after
applying:

| plan | was | now | credits |
| ---- | --- | --- | ------- |
| starter | ₹499 | **₹1,999** | 1,500 (unchanged) |
| growth | ₹1,499 | **₹3,999** | 5,000 → **4,000** |
| agency → **Studio** | ₹3,999 | **₹7,999** | 15,000 → **12,000** |

**The migration alone would have been cosmetic.** MEASURED: the app reads
`PLAN_CATALOG` from `packages/shared/src/billing/plans.ts`, not the `plans`
table — `grep "from('plans')"` across `apps/web/src` and `packages/billing/src`
returns **nothing** — and `packages/billing/src/providers/cashfree/index.ts:114`
builds `order_amount` from `plan.priceInr`. Cashfree is the **only** provider
directory that exists. **So the promotion itself is what changed what customers
are charged**, and it would have done so whether or not the migration ran.

That is why this session STOPPED and asked rather than proceeding: the founder
asked to ship a knowledge feature, and the mechanism that ships it also raises
every price. Answer, verbatim option: **"Yes — ship the new prices too."**
Existing `subscriptions` rows are untouched; no provider price object was moved.

**Migrations.** Six, listed above. Applied via the Supabase MCP
`apply_migration`, not `supabase db push` — the direct database host resolves
**AAAA-only** and this sandbox has no IPv6 route, so `db push` cannot connect
from here at all.

**Contract.** None edited. `packages/shared` was read, never written.

---

## Guards written, and the mutation that proved each

Four mutations, every one applied, run, and WATCHED go red, then restored.

| # | Mutation | Result |
| - | -------- | ------ |
| 1 | `knowledge-context.ts:136` — the tenant term `?workspace_id=eq.${…}` replaced with `?ordinal=gte.0`, removing the ONLY tenant boundary (the provider reads with the service key, so RLS is bypassed) | **RED.** `knowledge-context.test.ts:161` — `expect(msg?.content).not.toContain('RIVALCORP')` failed; another tenant's passage reached the prompt. 1 failed, 13 passed. Restored: **14 passed** |
| 2 | `MIN_SEED_CHARS` 200 → 40, the PDF door's floor | **RED, 2 of 10.** `refuses a login wall…` and `the floor is 200 characters…`. The first uses the REAL production string, all 74 characters of it, and asserts its length so the case cannot rot |
| 3 | `return result.ok ? 'seeded' : 'failed'` → `return 'seeded'` | **RED, 1 of 10.** `reports a refused document as failed rather than seeded` |
| 4 | The `catch` in `seedLibraryFromSite` changed from `return 'failed'` to `throw error` | **RED, 1 of 10.** `never throws, whatever the library does` — the guard that keeps a library row from breaking somebody's signup |

**Ten new guards** in `apps/web/src/lib/onboarding/seed-library.test.ts`.

---

## Anything retracted

**Three, all mine, all MEASURED.**

**1. "Four database updates are missing" was wrong. It was six.** I counted by
probing for tables over PostgREST. Two of the six alter existing objects
(`loop_cycles.reflect_reason`, and `loop_autopilot_l3`'s trigger plus two
`loop_settings` columns) and are invisible to a table probe. I also reported
`assets.trashed_at` as absent — **the column is `deleted_at`**, and
`20260827112432_assets_trash` was already applied. `list_migrations` is the
instrument; table probes are not.

**2. "The 9 suggestions in the review queue came from the knowledge library" —
withdrawn before it reached the founder.** An adversarial pass found a second
writer: `apps/web/src/lib/loop/store.ts:423` inserts `memory_events` with
`source='insight'` hardcoded, exactly as `actions/knowledge.ts:653` does, and
the table has **no column naming its writer**. They are separable only by
inspecting `diff` (`loop_cycle_id` ⇒ Loop; a `document:<uuid>#<n>` citation in
`evidence_refs` ⇒ Knowledge). Unattributed, and stated as unattributed.

**3. A first `pnpm turbo run typecheck lint test` reported 27/27 in 2.4
seconds.** That is a cache replay and verified nothing. Re-run with `--force`.
The real figure is in the Gate section.

---

## What the next session in THIS lane should pick up

1. **Monday's check-in fires at 09:00Z on 2026-08-31** and carries the full
   brief. Sunday 30 August is the first run of BOTH weekly jobs in their new
   form — the Loop at 21:00Z, the Marketing Brain at 21:30Z, its first ever.
   A `marketing_pass_runs` row carrying declines is SUCCESS; a workspace with
   **no row** means the pass threw for it, which is a fault.
2. **Somebody must look at the live product.** Nobody has since it changed.
   Prices first. Then **sign up a throwaway account with a real website** and
   confirm the seeded document appears on `/brain/knowledge` — that is the only
   end-to-end proof the seed works, and it does not exist yet.
3. **Refuse near-empty pages on the MANUAL url door.** The automatic path now
   has `MIN_SEED_CHARS = 200`; `read-source.ts:90` still accepts any page with
   one non-whitespace character, and `extract-pdf.ts:60`'s `MIN_USEFUL_CHARS =
   40` applies to the PDF door ONLY. MEASURED in production: the Instagram
   document is **74 characters** of `"Instagram / See everyday moments from your
   close friends. / Log into Instagram"` — the login wall — stored as 1 passage
   and badged **Indexed**, indistinguishable from the 7,950-character proposal
   PDF beside it. It must NOT apply to the typed door, where 30 deliberate
   characters are the person's own words. `no_text` is an existing
   `failure_code`, so no migration is needed; the URL door creates its row
   first, so the failure is visible and self-explaining. Reuse
   `MIN_SEED_CHARS`'s reasoning, not necessarily its number: a page somebody
   CHOSE may deserve a lower floor than one nobody asked for.
   **Also still true: the Instagram row is still in production.** The founder
   asked for it to be deleted; I declined the method, not the request.
4. **The QA logger records scratch-folder and mutation runs as product
   failures.** Three separate false `fail` rows in one session. It should record
   the working directory, or refuse a run whose config path is outside the repo.
5. **"Sahoda never trains on it"** on `/brain/knowledge` (`page.tsx:175`) has no
   enforcement anywhere in `packages/mesh` — grepped for `data_collection`,
   `allow_training`, `zdr`, `retention`; three unrelated hits. It is a vendor
   contract claim wearing a product guarantee's clothes. Prove it or soften it.
6. **Retrieval is filter-then-truncate, not rank-then-take** — the five passages
   are five of the matches, not the best five (`knowledge-context.ts:60-65`).
   A `ts_rank` RPC is the fix and belongs to the db lane.

---

## Gate

Run from the repo root, unpiped. Two forced runs: the first on `1debd3f3`
(before the seed feature), the second on the tree that became `b57f93ca`.

| leg | result |
| --- | ------ |
| `pnpm turbo run typecheck lint test` (first attempt) | **INVALID — cache replay.** 27/27 in **2.4s**, 18 cached. Verified nothing |
| `--force`, on `1debd3f3` | **PASS.** `27 successful, 27 total`, `Cached: 0`, **5m39.5s**. `@sahoda/web`: **474 files passed, 3 skipped; 6,023 tests passed, 13 skipped, 0 failed** |
| `--force`, on the seed tree (`b57f93ca`) | **PASS.** `27 successful, 27 total`, `Cached: 0`, **5m36.4s**. `@sahoda/web`: **475 files passed, 3 skipped; 6,033 tests passed, 13 skipped, 0 failed**. The deltas are +1 file and +10 tests, which is exactly `seed-library.test.ts` |
| `@sahoda/mesh` grounding suites, direct | **PASS.** 4 files, **45 tests**, 1.38s |
| `@sahoda/mesh` knowledge-context, mutated | **FAIL as intended**, 1 of 14. Restored: **PASS**, 14 of 14 |
| `seed-library` + knowledge suites, direct | **PASS.** 4 files, **31 tests**, 1.83s |
| `seed-library`, three mutations | **FAIL as intended**: 2, 1, 1 of 10. Restored: **PASS**, 10 of 10 |
| `npx prettier --check .` | **PASS.** `All matched files use Prettier code style!` |
| `test:smoke` / Playwright | **UNRUN, never passed.** Probe verdict `LOCAL_ONLY`; Chromium reaches loopback only. The onboarding e2e specs, which are the ones that would exercise the seed, are among the unrun |
| First production build | **READY**, 2m31s, `dpl_CDjgLHuVu6y5Xp2zU5UM413yfXzn`, at `28aae473` |
| Second production build | **READY**, 2m07s, `dpl_9eG9LighuvE54Qs4LsGUAKdLENsV`, at `b57f93ca` |
| Live smoke, by fetch, after both | `/sign-in` **200**. `/` and `/home` **404** signed-out — identical on the build that preceded all of this |

**The forced run is the one that counts.** The 2.4-second run is recorded
because a cached green is the exact shape of a lie this repository has been
bitten by, and deleting it would hide that it happened.
