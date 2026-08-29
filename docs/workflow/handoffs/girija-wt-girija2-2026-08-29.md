# Handoff — girija — wt-girija2 — 2026-08-29

**Branch** `wt-girija2` at `1debd3f3`. Lane `wt-girija2`. Pushed: **yes**.
No PR: the lane is 0 commits ahead of `wt-core` in content — its only commits
are trunk merges.

**This session wrote no product code.** It answered three questions and then
executed the two gated steps in the whole system, both on the founder's explicit
instruction: **six migrations applied to production, and `wt-core` promoted to
`wt-web`.** That promotion is live and serving.

---

## What shipped

Nothing from this lane's own hand. What went LIVE is the trunk, and that is the
item worth recording.

| # | What | Proof | Covered by |
| - | ---- | ----- | ---------- |
| 1 | Six migrations applied to project `rloztdhzfliyvpvxsgjl` | `list_migrations` now carries `reprice_plans_from_business_model_deck`, `marketing_pass_runs`, `loop_reflect_reason`, `studio_designs`, `loop_autopilot_l3`, `loop_autopilot_log` | each table/column re-read over PostgREST after the fact — all seven checks OK |
| 2 | `wt-core` `28aae473` promoted to `wt-web`, fast-forward | `git push origin origin/wt-core:refs/heads/wt-web` → `e8867241..28aae473` | Vercel `dpl_CDjgLHuVu6y5Xp2zU5UM413yfXzn`, **READY**, built in 2m31s, aliased to `app.sahodalabs.com` |
| 3 | Knowledge grounding now in production | `packages/mesh/src/knowledge-context.ts` present on `origin/wt-web`; `caption_rewrite` and `content_variants` declare `knowledgeQuery` | `knowledge-context.test.ts` 14, `knowledge-injection.test.ts` 5, plus the mutation below |
| 4 | The Loop's Sunday cron can run again | `origin/wt-web:apps/web/src/lib/cron/run-loop.ts` no longer contains `from loop_autonomy`; `loop-facts-sql.ts` carries `loop_channel_autonomy` twice | wt-divas's `loop-facts-sql.pglite.test.ts` |
| 5 | Monday check-in armed | `trig_01TD9NJWMfepuLbnzPzVqAZ7`, fires 2026-08-31T09:00Z into this session | n/a |

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
- **The near-empty-page refusal was started and abandoned mid-edit** when the
  founder redirected. Nothing was written; `read-source.ts` is untouched. The
  design is in "Next session" below.
- **`ops/state/qa.pending.json` was discarded THREE times.** The QA logger
  appended `fail` rows for a scratch-folder vitest invocation and for my own
  deliberate mutation. Recording those as product failures would be a lie in the
  QA record. **This is a real defect in the logger** — see "Next session".

---

## Shared surfaces touched

**None by this lane.** No file under `apps/`, `packages/` or `docs/` was
modified. The tree is byte-identical to `origin/wt-core` plus this handoff.

What OTHER lanes must know is that the trunk they merge into is now the
production branch as well, and **six migrations that were file-only are now
applied**. A lane holding an unapplied assumption about any of those six —
particularly `loop_channel_autonomy.level <= 3` and the new autopilot trigger —
is now wrong.

---

## Contract, migration or money

**All three, and the money one is the one to read.**

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

One mutation, on the guard that matters most in what shipped.

| # | Mutation | Result |
| - | -------- | ------ |
| 1 | `knowledge-context.ts:136` — the tenant term `?workspace_id=eq.${…}` replaced with `?ordinal=gte.0`, removing the ONLY tenant boundary (the provider reads with the service key, so RLS is bypassed) | **RED.** `knowledge-context.test.ts:161` — `expect(msg?.content).not.toContain('RIVALCORP')` failed; another tenant's passage reached the prompt. 1 failed, 13 passed |
| — | restored | **GREEN.** 14 passed |

No new guards were written this session.

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
   Prices first.
3. **Refuse near-empty pages in the knowledge library.** Designed, not built.
   `read-source.ts:90` accepts any page with one non-whitespace character;
   `extract-pdf.ts:60`'s `MIN_USEFUL_CHARS = 40` floor applies to the PDF door
   ONLY. MEASURED in production: the Instagram document is **74 characters** of
   `"Instagram / See everyday moments from your close friends. / Log into
   Instagram"` — the login wall — stored as 1 passage and badged **Indexed**,
   indistinguishable from the 7,950-character proposal PDF beside it. A page
   floor must be well above 40 (200 was the working figure) and must NOT apply
   to the typed door, where 30 deliberate characters are the person's own words.
   `no_text` is an existing `failure_code`, so no migration is needed; the URL
   door creates its row first, so the failure is visible and self-explaining.
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

Run from the repo root, unpiped, on `1debd3f3`.

| leg | result |
| --- | ------ |
| `pnpm turbo run typecheck lint test` (first attempt) | **INVALID — cache replay.** 27/27 in **2.4s**, 18 cached. Verified nothing |
| `pnpm turbo run typecheck lint test --force` | **PASS.** `Tasks: 27 successful, 27 total`, `Cached: 0`, **5m39.5s**. `@sahoda/web`: **474 test files passed, 3 skipped; 6,023 tests passed, 13 skipped, 0 failed** (299.6s) |
| `@sahoda/mesh` grounding suites, direct | **PASS.** 4 files, **45 tests**, 1.38s |
| `@sahoda/mesh` knowledge-context, mutated | **FAIL as intended**, 1 of 14. Restored: **PASS**, 14 of 14 |
| `test:smoke` / Playwright | **UNRUN, never passed.** Probe verdict `LOCAL_ONLY`; Chromium reaches loopback only |
| `prettier --check .` | **UNRUN** this session. No file was modified before the handoff, so the tree it would check is `origin/wt-core`'s own |
| Production build after promotion | **READY**, 2m31s, `dpl_CDjgLHuVu6y5Xp2zU5UM413yfXzn` |
| Live smoke, by fetch | `/sign-in` **200**. `/` and `/home` **404** signed-out — identical on the previous build |

**The forced run is the one that counts.** The 2.4-second run is recorded
because a cached green is the exact shape of a lie this repository has been
bitten by, and deleting it would hide that it happened.
