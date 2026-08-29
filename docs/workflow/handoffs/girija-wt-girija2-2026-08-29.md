# Handoff — girija — wt-girija2 — 2026-08-29

**Branch** `wt-girija2` at `2e9cb6e7`. Lane `wt-girija2`. Pushed: **yes**, and
landed on `wt-core`. No PR: the lane merges directly, and `wt-core` now carries
this work.

**Live:** <https://app.sahodalabs.com>
**This lane's preview:**
<https://sahodalabs-git-wt-girija2-development-4417s-projects.vercel.app>

**Two gated steps and two changes, all on the founder's explicit instruction:**
six migrations applied to production, `wt-core` promoted to `wt-web` **three
times**, the signup door now seeds the knowledge library with the website it
already reads, and `/brain/knowledge` had a **Tone Setup**. All three promotions
are live and serving.

> **This file was EXTENDED in place, not appended to with a `## Session 2`.**
> It is one continuous session: three questions, then the promotion, then the
> handoff, then the founder asked for the seed feature and a second promotion.
> The `## Session n` rule exists so two DIFFERENT sessions cannot overwrite each
> other; that is not what happened here, and inventing a boundary inside one
> session would be a false record. The git diff on this file is the honest
> account of what was added when.

---

## What shipped

Two changes from this lane's own hand, and three promotions of the trunk.

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
| 9 | **Tone Setup on `/brain/knowledge`** | `2e9cb6e7`; new `components/knowledge/what-to-give.tsx`, plus `page.tsx`, `resolve-from-library.tsx`, `status-view.ts` | `what-to-give.test.tsx`, **5 tests**, two mutations below |
| 10 | `CLAUDE.md` gains a **Tone Setup** section, so the instruction has a fixed meaning | `CLAUDE.md`, above the five copy rules | prose |
| 11 | Third promotion: `wt-core` `2e9cb6e7` → `wt-web`, fast-forward, **0 migrations** | `b57f93ca..2e9cb6e7` | Vercel `dpl_9tbtSwYcE7eVyGvGELthzJyfewXq`, **READY**, 2m07s |

**Item 9, what actually changed.** The screen named the parts and never the
capability. MEASURED and the two figures are one defect: three documents across
33 workspaces ever, and one of the three an Instagram login wall stored as 74
characters and badged exactly like a rate card. Nothing said what to put in it.

| surface | was | now |
| ------- | --- | --- |
| lead paragraph | "The documents Sahoda has read… and the passages you can search. Resolve your Brand Brain from them" | "Give Sahoda the documents that hold your real prices, policies and promises. It reads them once and quotes them back when it writes for you, instead of guessing." |
| badge | `Indexed` | **`Ready to quote`** |
| resolve panel | "Let your library teach the Brand Brain" | "Turn these into what Sahoda knows about you" |
| count | "2 of 2 ready to quote from" | "2 of 2 Sahoda can quote from" |
| empty state | "Give Sahoda something to read" | "Stop Sahoda guessing your prices" |
| empty-state tip | first person, and about resolving | third person, and about quoting a figure when it rewrites a post |
| new | — | `WhatToGive`: four documents each paired with what it unlocks, plus the warning about login pages and picture menus |

`WhatToGive` renders while `documents.length < 4` and disappears after. **Four
and not one**, because every seeded workspace now starts with exactly one
document, which is the case that still needs the prompt.

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
  still add a login wall by hand and see it badged `Ready to quote`, which the
  Tone Setup made a WARMER lie than `Indexed` was. Deliberate: the
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
| `apps/web/src/lib/knowledge/status-view.ts` | The indexed badge reads **`Ready to quote`**, was `Indexed` | Grepped: **no test and no e2e spec asserted the string `Indexed`**, so nothing broke. A lane writing one should assert the CLAIM, not this wording |

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
| 5 | All four `unlocks` clauses in `WhatToGive` blanked, leaving bare document types | **RED, 1 of 5.** `pairs every document with the thing it lets Sahoda do`. The guard asserts BOTH halves per item, because a list of categories alone passes a naive text check |
| 6 | The login-wall and picture-menu warning deleted from `WhatToGive` | **RED, 1 of 5.** `warns about the two things that fail while looking like they worked` |

**Fifteen new guards**: ten in `apps/web/src/lib/onboarding/seed-library.test.ts`,
five in `apps/web/src/components/knowledge/what-to-give.test.tsx`. The second
file also pins the third person and the no-dash ruling on this block, so a later
rewrite cannot quietly reintroduce either.

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
5. **"Sahoda never trains on it" is GONE, and that is a decision to revisit,
   not a closed item.** It was removed in `2e9cb6e7` because nothing in
   `packages/mesh` enforces it (grepped `data_collection`, `allow_training`,
   `zdr`, `retention`; three unrelated hits). What replaces it states what IS
   enforced plus what actually happens: nothing is shared with another business,
   and a few matching passages go to the model at the moment it writes. **If the
   supplier contract does back the stronger claim, put it back** with that on
   the record. The founder was told, and did not object.
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
| `--force`, on the tone-setup tree (`2e9cb6e7`) | **PASS.** `27 successful, 27 total`, `Cached: 0`, **5m37.7s**. `@sahoda/web`: **476 files passed, 3 skipped; 6,038 tests passed, 13 skipped, 0 failed**. +1 file and +5 tests against the previous run, which is `what-to-give.test.tsx` exactly |
| `--force`, FIRST attempt on that tree | **FAIL, and mine.** `@sahoda/web#lint`: design lint, `hardcoded spacing — NEW in 1 file(s)`, two `mt-[3px]` in `what-to-give.tsx` against a baseline of 0. Fixed with the existing `mt-icon-nudge` token. **`@sahoda/publishing:typecheck` and `@sahoda/shared:test` also printed failures in that run and were CANCELLATIONS, not defects** — turbo stops the fan-out on the first failure, the whole run was 5.07s, and all 27 pass on the re-run. Recorded because "three packages red at once" is the shape that gets misread as an environment fault |
| `npx prettier --check .` | **PASS.** `All matched files use Prettier code style!` |
| `test:smoke` / Playwright | **UNRUN, never passed.** Probe verdict `LOCAL_ONLY`; Chromium reaches loopback only. The onboarding e2e specs, which are the ones that would exercise the seed, are among the unrun |
| First production build | **READY**, 2m31s, `dpl_CDjgLHuVu6y5Xp2zU5UM413yfXzn`, at `28aae473` |
| Second production build | **READY**, 2m07s, `dpl_9eG9LighuvE54Qs4LsGUAKdLENsV`, at `b57f93ca` |
| Live smoke, by fetch, after both | `/sign-in` **200**. `/` and `/home` **404** signed-out — identical on the build that preceded all of this |

**The forced run is the one that counts.** The 2.4-second run is recorded
because a cached green is the exact shape of a lie this repository has been
bitten by, and deleting it would hide that it happened.

---

## The logo was uploaded, stored, and invisible (`ba47a1a3`)

The founder reported a red square where the topbar logo should be, and a
second thing at the same time: the product had gone the colour of his logo
everywhere. Two defects, one screen, fixed together.

### 1 · The title every caller set was dropped on the floor

`uploadAsset` read `file.name` and nothing else. Three call sites had been
setting a `title` field on the form the whole time:

| caller | field it set | what was stored |
| ------ | ------------ | --------------- |
| `use-build.ts` (signup logo step) | `Logo` | the file name |
| `brand-panel.tsx` ("Replace logo") | `Logo` | the file name |
| `use-build.ts` (URL sources) | the source key | the file name |

`readBrandLogo` finds the workspace logo with `.eq('title', 'Logo')`. There
was never a row carrying it, for anybody, so the topbar rendered its colour
chip for ever while the file sat in the library under whatever the customer
had called it. **Nothing reported a failure anywhere** — the upload succeeded,
the theme saved, the colours were right, and the one thing that pointed back
at the file was never written.

The rule is now `lib/assets/title.ts`: caller wins, file name is the fallback,
blank in either position is nothing said. Pure, so its six guards execute
rather than describe.

### 2 · Brand Skin repainted the product, and only the mark should

Founder's ruling, same day: *"Day/Night Theme Toggle should apply Sahoda Brand
Theme. Only the Left Brand Logo should apply Brand Skin."* This reverses the
scope shipped hours earlier in `47e2a935`, and the reason is on the record: it
emitted `:root:root`, which hands all seven themeable tokens to an automatic
read of one PNG. A grey-and-white logo made the whole interface washed out,
which is how the ruling arrived. The light and dark palettes are designed and
their contrast steps measured; that is not a decision to hand to a colour
histogram.

`skinCss` now takes a scope, defaulting to `SKIN_SCOPE = '[data-brand-skin]'`,
and `brand-mark.tsx` is the only element carrying it. The attribute selector
is 0,1,0 against `tokens.css`'s bare `:root` at 0,0,1, so the brand wins
inside the mark with no `!important`.

**The regression is one character away at all times** — `:root` compiles,
renders, and silently puts it back — so `skinIsGlobal` names the failure and
a guard asserts it in both directions.

The panel's copy went with it. "Every button and link follows it" was true for
a few hours and became a lie the moment the scope narrowed; it now names the
two places the colour actually reaches.

### Mutation

| mutation | result |
| -------- | ------ |
| `assetTitle` falls back to the file name only | **RED** |
| `SKIN_SCOPE` back to `:root:root` | **RED** |
| the mark loses `data-brand-skin` | **RED** |
| all three at once | **RED**, 5 tests in 3 files |
| all three reverted | **PASS**, 359 tests in 36 files |

### Gate

| leg | result |
| --- | ------ |
| `pnpm gate`, first run | **FAIL, and NOT this change.** Root vitest, `a stale baseline entry cannot sit there forever`. Reproduced on `0cd3e40c` with the tree stashed, so **the trunk was already red**. Three stale entries removed by the test's own `--update-baseline`; the ratchet shrinks 65 → 62 |
| `turbo typecheck lint test` | **PASS**, 8 of 9 tasks; the ninth is smoke, below |
| `test:smoke` | **UNRUN.** `clerkSetup()` cannot reach Clerk's API from this sandbox. Environment, not the suite |
| `prettier --check .` | **PASS** |
| `pnpm --filter @sahoda/web build` | **PASS.** `js-budget ok: 82 routes within budget` |

**Run locally before promoting, every time.** The previous promotion was
reported as done while three production builds had errored on the js-budget,
and Vercel had quietly kept serving the old one.

### Still open

- **A logo uploaded BEFORE this fix is still not findable.** The row carries
  the file name. Re-uploading through the topbar's "Replace logo" writes a
  correct row; nothing backfills the old ones, and a backfill would need a
  guess about which image is the logo. Say this to anyone who uploaded early.
- **There is still no `workspaces.logo_asset_id`.** Finding the logo by title
  is a known compromise, written down in `lib/brand/logo.ts`. A customer who
  titles some other picture `Logo` by hand would see it in the topbar. Visible,
  reversible, costs nothing, and a column is a founder decision.
