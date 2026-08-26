# Handoff — research — 2026-08-26

**Owner** girija — DECLARED, after I guessed wrong. This file was written as
`research-2026-08-26.md`, renamed to `jiban-research-2026-08-26.md`, and renamed
again to `girija-research-2026-08-26.md`. Two separate faults, both mine:

1. The original name predates `d21bac3`, which changed the convention to
   `<owner>-<role>-<date>.md` and taught `/kickoff` to glob
   `docs/workflow/handoffs/*-<role>-*.md`. MEASURED: `ls *-research-*.md`
   returned nothing, so the file was invisible to the tooling meant to read it.
2. I then supplied the owner as `jiban`, inferred from the `/lead-research`
   card naming `wt-jiban`. **The command says ask rather than guess, and I
   guessed.** The declared owner is girija. Now set with
   `git config sahoda.owner girija` so nothing has to infer it again.

**`design-2026-08-25.md` is still orphaned** and I have NOT renamed it.
`ls *-design-*.md` returns nothing, so the design lead's own kickoff will not
find their own handoff. It needs their owner name, and after getting mine wrong
by inference I am certainly not inferring theirs. One `git mv` closes it.

**The branch you named does not exist.** `/handoff` was invoked with
`branch: wt-girija`; `git ls-remote --heads origin` lists `wt-girija2` and
`wt-girija3` but no `wt-girija`. This session was assigned
`claude/lead-research-tz63ld` by the harness, PR #4 tracks it, and the advisor
has already merged it into `wt-core` twice. So the work is pushed THERE and I
have not created a fourth girija branch on a guess. Say the word and it is one
push.

## What shipped

| What | Proof | Test that covers it |
| --- | --- | --- |
| The Marketing Brain contract | `packages/shared/src/brain/observations.ts` | `apps/web/src/lib/brain/observe/tone-drift.test.ts` parses a real row through `marketingObservationSchema` |
| `marketing_observations` table | `packages/db/supabase/migrations/20260825000000_marketing_observations.sql` | `packages/db/tests/marketing_observations.pglite.test.ts` — 15 tests |
| **The migration is APPLIED to production** | MEASURED via Supabase MCP against ref `rloztdhzfliyvpvxsgjl`: 9 columns, `relrowsecurity=true`, 2 policies (`ops_select:SELECT`, `t_select:SELECT`), 3 indexes, 0 rows | the pglite suite above; and `get_advisors(security)` returns **0** findings naming the table |
| Tone-drift computer | `apps/web/src/lib/brain/observe/tone-drift.ts` | `tone-drift.test.ts` — 14 tests |
| Store + weekly pass | `apps/web/src/lib/brain/store.ts`, `apps/web/src/lib/brain/run.ts` | `apps/web/src/lib/brain/run.test.ts` — 6 tests |
| Weekly cron `30 21 * * 0` | `apps/web/src/app/api/cron/brain/route.ts`, `apps/web/vercel.json:22` | `apps/web/src/lib/cron/heartbeat.test.ts` (schedule ↔ `CRON_SCHEDULES`), `apps/web/src/lib/cron/wiring.test.ts` (schedule ↔ Clerk exemption ↔ route on disk) |
| Read + the block on /report | `apps/web/src/lib/brain/read.ts`, `apps/web/src/components/brain/observation-note.tsx`, `apps/web/src/app/(app)/report/page.tsx` | `apps/web/e2e/marketing-brain.spec.ts` — **@smoke, and UNRUN, see below** |
| Operator window | `apps/web/src/app/admin/brain/page.tsx`, `apps/web/src/lib/ops/read.ts` `readMarketingObservations` | the `ops_select` cases in the pglite suite |
| Mesh grounding, wired to `plan_week` alone | `packages/mesh/src/market-context.ts`, `packages/mesh/src/tasks/plan-week.ts` `wantsMarketContext: true` | `packages/mesh/src/market-context.test.ts` (8), `market-injection.test.ts` (5), `plan-week.test.ts` (11) |
| CI runs the gate | `.github/workflows/gate.yml` | `scripts/lib/ci-gate-coverage.test.mjs` — 6 tests; and run 32932031102 **success** on `00eaa15` |
| Pre-commit scratch guard | `.githooks/pre-commit`, installed by `scripts/cloud-setup.sh:228` | `scripts/lib/pre-commit-hook.test.mjs` — 4 tests |
| Reports | `docs/51`, `docs/52`, `docs/53`, `docs/54` | n/a — prose |

**What the Marketing Brain will actually say today: nothing, and honestly.**
MEASURED against production: exactly one workspace has published posts — 5 of
them, all `published_on = 2026-08-10`, span 1 day, 0 exclamation marks total.
`toneDrift` declines with `window_too_short` (floor is 21 days). The block
renders its empty state. No demo row was seeded: a fabricated "Sahoda noticed"
sentence in the customer database is the one thing the table's own column
comment forbids.

## What was NOT done, and why

- **The Playwright leg is UNRUN. Not passed — UNRUN.** MEASURED: Playwright's
  bundled Chromium cannot complete any outbound HTTPS request in a
  claude.ai/code sandbox. `https://example.com/` fails `net::ERR_CONNECTION_RESET`
  identically to Clerk's host, while a trivial Node server on the same loopback
  port answers Chromium 200 and Playwright's own Node-side request context
  fetches the same HTTPS URL with 200. The agent proxy logs **no attempt**. Every
  `@smoke` spec signs in through Clerk. The only local "fix" is
  `--ignore-certificate-errors`, which is disabling TLS verification, and it
  would not work anyway — there is no certificate to distrust when there is no
  connection. REQUESTS §25.
- **`e2e/marketing-brain.spec.ts` has therefore never executed.** It is written
  and tagged `@smoke`. It probes the TABLE rather than a flag, so it runs the day
  someone runs the suite, with no edit.
- **Draft capture (docs/53 step 4) not started.** It is the item with a clock:
  the edit overwrites the draft, so the rewrite history that the evidence-receipt
  and improvement-receipt moments both need is being destroyed daily.
  REQUESTS §22.
- **Cross-customer cohort patterns (docs/53 step 5) not started**, deliberately
  last — strongest claim, privacy constraint belongs in the schema.
- **`docs/46` Q4 is still wrong**; it carries a correction banner rather than a
  rewrite.

## Shared surfaces touched

Not "none". Five, and two of them can break a constructor.

| Surface | Change | Breaks a reader or a constructor? |
| --- | --- | --- |
| `packages/shared/src/brain/observations.ts` | **NEW FILE**, re-exported from `packages/shared/src/index.ts` | Neither. Additive. |
| `packages/mesh/src/engine.ts` `MeshTaskSpec` | gains **optional** `wantsMarketContext?: boolean`; `buildMessages` gains an **optional 5th** parameter `market?: ChatMessage`; `MeshRunnerDeps` gains **optional** `marketContext?` | Neither — every addition is optional. A task's `buildMessages` that ignores the 5th arg still compiles. |
| `apps/web/src/lib/cron/heartbeat.ts` `CronJob` | union gains `'brain'` | **BREAKS CONSTRUCTORS.** Any exhaustive `Record<CronJob, …>` now needs a `brain` key. One existed — `PATH_BY_JOB` in `heartbeat.test.ts:135` — and is updated. If another lane has written one, it will not compile. |
| `turbo.json` `tasks["test:smoke"].env` | gains `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Neither. Turborepo strict env mode STRIPS undeclared vars, so this only widens what reaches the task. Without it a CI smoke run fails deep inside the app rather than at the top. |
| `apps/web/src/middleware.ts` | `/api/cron/brain` added to `isPublicRoute` and to both matcher regexes | Neither, and it is an EXACT path — `/api/cron/brain-v2` inherits nothing. |
| `.githooks/pre-commit` + `core.hooksPath` | **NEW.** `scripts/cloud-setup.sh` now runs `git config core.hooksPath .githooks` | Behaviour change for everyone: a commit staging `ops/state/qa.pending.json` is refused. Escape hatch `ALLOW_QA_PENDING=1`. |

Also touched, shared but not a contract: `docs/38_Data_Handling.md` (48 → 49
tables), `apps/web/src/lib/privacy/export-manifest.ts`,
`packages/db/tests/helpers/pglite-tenant.ts` (`SHAPE_OVERRIDES` entry),
`packages/db/tests/rls_tenant_isolation.pglite.test.ts`
(`EXPECTED_OPERATOR_ONLY`), `apps/web/scripts/perf/js-budget.json`,
`apps/web/src/lib/perf/read-waterfall.baseline.json`.

## Guards written, and the mutation that proved each

Thirty mutations. Every one watched go red except the one noted, which is
recorded rather than hidden.

**`tone-drift.test.ts` (6)** — `MIN_BASELINE_RATE` 0.5→0; `MIN_WINDOW_DAYS`
21→1; `MIN_RATE_CHANGE` 0.6→0.1; `MIN_POSTS_PER_WINDOW` 5→3; the two arms
overlapped so the middle post counts twice; the "stopped" claim collapsed into
the vaguer "fewer". All red.

**`marketing_observations.pglite.test.ts` (6)** — `t_select` unscoped to
`using (true)`; a member write policy added; unique key stripped of `subject`
(exit 1, reported as 12 skipped — a file-level failure, which is the shape that
reads as green, so the exit code is the evidence); `evidence` check dropped;
`ops_select` removed; `ops_select` widened from `for select` to `for all`.
All red.

**NOT RED, and recorded:** deleting `alter table … enable row level security`
changes nothing. MEASURED — `relrowsecurity` stays `true` with the line gone,
because `20260801000000_rls_auto_enable.sql` installs an event trigger that
enables RLS on every new public table. The explicit line stays; that migration's
own header calls itself a backstop, not a substitute.

**`market-context.test.ts` (3)** — the `workspace_id=eq.` term dropped from the
URL (this is the tenant boundary: service key bypasses RLS); the do-not-quote
instruction removed; an empty result yielding a block anyway. All red.

**`plan-week.test.ts` (2)** — market block placed above brand; `wantsMarketContext`
removed. Both red.

**`run.test.ts` (5)** — failures folded into declines; decline reasons collapsed
to one total; a refresh counted as an insert; one workspace's throw ending the
pass; `computed_on` taken from local time instead of UTC. All red.

**`heartbeat.test.ts` (1)** — `vercel.json` schedule changed `30 21 * * 0` →
`30 21 * * *`. Red, and the message names both numbers.

**`ci-gate-coverage.test.mjs` (6)** — a sixth gate stage added that CI ignores;
the workflow dropping prettier; a stage renamed while the guard still claims it;
`test:smoke` wired into the pull-request job; the acknowledgement input given a
default so a click would arm it; `turbo.json` declaring an env var the workflow
never supplies. All red.

**`pre-commit-hook.test.mjs` (5)** — the guard removed; the remedy dropped from
the refusal message; the escape hatch broken (exit 1 via `beforeAll`); every
commit refused; **the executable bit cleared**. That last one matters most: git
ignores a non-executable hook silently, so every other assertion would pass by
never running.

The hook was also proved against this repository, not only the fixture: staging
`ops/state/qa.pending.json` and running `git commit` printed the refusal and
exited non-zero.

## Anything retracted

1. **"Playwright fails because Chromium does not trust the agent proxy's CA."
   WRONG, retracted in `cc2e5fb`.** MEASURED, six ways: Chromium loads the
   proxy's own HTTP endpoint 200; loads plain-HTTP `example.com` 200; fails every
   `https://` with RESET under no proxy flag, a launch-option proxy, and
   `--proxy-server` + `--proxy-bypass-list=<-loopback>`; the proxy's
   `recentRelayFailures` stays **empty** throughout; Playwright's Node-side
   `APIRequestContext` fetches the same URL 200. A CA failure raises
   `ERR_CERT_AUTHORITY_INVALID` and appears in the proxy log, because the tunnel
   exists first. Neither happens.

2. **"The other four gate legs are green." WRONG, retracted in `98849d9`.**
   Root vitest is one of the four and it is red here. MEASURED: `chmodSync(dir,
   0o500)` then a write SUCCEEDS in this sandbox, reporting `uid 0` — root
   bypasses the mode bits. Pre-existing: the same two fail on a clean tree at
   `cc2e5fb`. CONFIRMED green on a GitHub runner — 14 files / 218 tests / 0
   failed. REQUESTS §26.

3. **The concurrency key I introduced in `89874c6` was wrong and I corrected it
   in `00eaa15`.** Keying on the head COMMIT collapses the push/pull_request pair
   and silently disables cancellation, because two commits are two groups.
   MEASURED four minutes later: amending a commit left run 4 grinding twelve
   minutes for a SHA no longer on the branch. `github.head_ref || github.ref`
   gets both halves right.

## Anything that changes an assumption

- **The gate is FIVE stages, not four.** `scripts/gate.mjs:60` runs
  `turbo typecheck lint test`, root `vitest`, `turbo test:smoke`,
  `prettier --check .`, **and `turbo build`**. The root `CLAUDE.md` line
  describing `pnpm gate` as a four-part shell string is stale — `turbo build`
  IS in it, and `js-budget.mjs` runs inside that build. Not corrected here
  because it is a root-CLAUDE.md edit mid-session; worth the next person's ten
  minutes.
- **A cloud session cannot run two of the five legs honestly.** Playwright
  cannot run at all (§25) and root vitest has two failures caused by uid 0
  (§26). Anyone reporting "the gate is green" from a cloud session must say
  which legs. The `gate.yml` workflow now covers the uid-0 case better than any
  session can.
- **`.github/workflows/gate.yml` fired on two pushes and then silently stopped.**
  MEASURED: `eb227bb` and `2a5c9d4` both reached the remote (Vercel built each)
  and neither produced a run; `2a5c9d4`'s check list held only Vercel's entries.
  The workflow was valid, `state: active`, other workflows ran in the same
  minutes, and a manual dispatch went green. **Cause unknown.** Mitigated by
  `on: push` for every branch. REQUESTS §27. If a run goes missing again, the
  push event has failed too and the Actions UI stops being evidence.
- **Adding one table turns six existing repo guards red on its own**, each
  naming its remedy: `docs/38`'s table count, the DPDP export manifest, the
  NAMED operator-only set in `rls_tenant_isolation`, the erasure seeder (needs a
  `SHAPE_OVERRIDES` entry — its only jsonb rung is `'{}'`, precisely the value an
  evidence check rejects), the cron-wiring trio, and both per-route baselines.
  Budget an hour for them, and do not reach for `PERF_BUDGET_WRITE=1` or
  `PERF_WATERFALL_WRITE=1` — both rewrite the whole file and mask drift.
- **The `@smoke` counts moved**: 275 tests in 71 files total, **116 tagged
  `@smoke` in 36 files** (was 274 / 115 in 70 / 35). Re-measured and CLAUDE.md
  updated in the same commit that moved them.

## Gate

Run on `00eaa15`, 2026-08-26, in this cloud sandbox. Exit codes captured
directly, never through a pipe.

| Leg | Command | Result |
| --- | --- | --- |
| 1 · turbo typecheck + lint + test | `turbo run typecheck lint test --concurrency=1 --force` | **PASS** — 27 of 27 tasks, exit 0. `--force`, so no cache replay. web 381 files / 3 skipped; db 32 / 12 skipped; sites 53; jobs 34; mesh 23; billing 30 / 1 skipped; publishing 25; shared 19; research 13. The `[plan-week] failed (PROVIDER_ERROR)` lines are fixture output from passing tests, not failures. |
| 2 · root vitest | `vitest run` | **FAIL — 2 failed, 220 passed (222), exit 1.** Both in `scripts/lib/mutation-harness.test.mjs`, both the same error: a `0500` directory is writable because this sandbox is uid 0. **NOT caused by this lane** — same two fail on a clean tree at `cc2e5fb`, and CONFIRMED passing on a GitHub runner (218/218). REQUESTS §26. |
| 3 · turbo test:smoke (Playwright) | not attempted | **UNRUN.** Chromium reaches no HTTPS host in this sandbox. REQUESTS §25. Run it before this lane merges: `pnpm gate` on a laptop, or dispatch the `smoke` job on `gate.yml` and type `rloztdhzfliyvpvxsgjl`. |
| 4 · prettier --check . | `prettier --check .` | **PASS** — exit 0. |
| 5 · turbo build | `turbo run build --concurrency=1` | **PASS** — exit 0, 1m58s, `js-budget ok: 81 routes within budget`. Not cached. |

**CI, which is the honest cross-check on legs 1, 2 and 4:** run
`32932031102` on `00eaa15` — `typecheck · lint · test · format` **success**
(10m22s), `Playwright @smoke` **skipped** by the acknowledgement guard.
Root vitest passed there, which is legs 1, 2 and 4 green on a machine that is
not uid 0.

## For whoever picks this up

1. **Draft capture.** REQUESTS §22. The clock item.
2. **Run the smoke leg** before merging this lane.
3. **Three decisions still unanswered by the founder** since 25 August: is
   Brand-has-veto the arbitration rule (it is currently encoded as prompt
   ordering in `plan-week.ts` and pinned by a test); when this lane merges into
   `wt-core`; and whether the lane should be renamed to `wt-jiban`.

---

## Session 2 — 2026-08-26, after the first handoff

The first handoff was filed at `650775f`. Everything below happened after it.

### What shipped

| What | Proof | Test |
| --- | --- | --- |
| `on: push` for every branch, after the `pull_request` event went missing twice | `.github/workflows/gate.yml`, `89874c6` | runs 4 and 5 fired automatically on push |
| Concurrency keyed on the branch, correctly, on the third try | `.github/workflows/gate.yml:98`, `00eaa15` then `b4a156e` | `scripts/lib/ci-gate-coverage.test.mjs` pins the exact expression |
| `scripts/auto-handoff.mjs` formatted | `888f226` | `prettier --check .` exit 0; CI run 32941480874 **success** |
| This handoff renamed twice so `/kickoff` can glob it | `67e83ae`, and this commit | `ls *-research-*.md` now returns it |

### What was NOT done, and why

- **The smoke leg is still UNRUN.** Unchanged from session 1: REQUESTS §25.
- **`design-2026-08-25.md` left orphaned** — needs its owner's name.
- **The Stop hook's `jq` call is broken and I did not fix it.** Its own output
  shows `jq: parse error: Invalid string: control characters from U+0000 through
  U+001F must be escaped`. That is `echo $INPUT | jq -r '.stop_hook_active'` —
  unquoted `$INPUT` against multi-line JSON — so `stop_hook_active` can never be
  read and the hook's re-entry guard never fires. One character fixes it:
  `echo "$INPUT"`. It lives in `.claude/settings.json`, which the advisor was
  actively editing in the same minutes, so I flagged rather than raced.
- **`wt-girija` not created.** See the header.

### Shared surfaces touched

| Surface | Change | Breaks? |
| --- | --- | --- |
| `.github/workflows/gate.yml` | `on: push` now fires for EVERY branch, not three | Affects every lane: each push costs a runner. Intentional, and the concurrency group keeps it to one run per branch. |
| `scripts/auto-handoff.mjs` | formatted, no behaviour change | No. Verified hunk by hunk. |
| `git config sahoda.owner` | set to `girija` | Local to this clone only. Not committed, cannot affect anyone else. |

### Guards written, and the mutation that proved each

`ci-gate-coverage.test.mjs` gained a seventh test pinning the concurrency
expression. Three mutations, all red: back to `github.head_ref || github.ref`
(the bug it was written for), back to the SHA key, and the block deleted.

### Anything retracted

1. **"The concurrency key is fixed." WRONG, twice.** MEASURED on the three-lane
   merge: SEVEN gate runs in flight, three of them push/pull_request PAIRS for
   the same branch at the same SHA. `github.head_ref || github.ref` cannot
   collapse, because on a push `github.ref` is `refs/heads/<branch>` while
   `head_ref` is the bare `<branch>`. `ref_name` is the bare name. Fixed in
   `b4a156e` and CONFIRMED: run 15 (`push`) cancelled 7s after run 16
   (`pull_request`) entered the same group.
2. **"Owner is jiban." WRONG.** Inferred from the `/lead-research` card. The
   declared owner is girija.

### Anything that changes an assumption

- **This branch has an ACTIVE concurrent writer.** The advisor pushed to it four
  times during this session — two integration merges, a handoff-identity fix and
  a security change. A push was rejected once. MEASURED, not feared.
- **A merge fused two cron entries.** `radar` and `brain` were combined into one
  object in `vercel.json`; caught by the advisor in `46174f3`. Both are correct
  now and `CronJob` carries both. This is the shared-surface hazard the first
  handoff's table named, arriving within the hour.
- **The gate on the MERGED tree is green** — runs 11 and 12 on `5bef42d`, all
  three lanes together, both success.

### Gate

Re-run at `888f226`, cold (`--force` on leg 1, no cache on leg 5).

| Leg | Result |
| --- | --- |
| 1 · turbo typecheck + lint + test | **PASS** — 27/27 tasks, exit 0. web 389 files / 3 skipped (was 381: the merge brought other lanes' tests in). |
| 2 · root vitest | **FAIL — 2 failed, 221 passed (223), exit 1.** Both `mutation-harness.test.mjs`, one error: a `0500` directory is writable at uid 0. Pre-existing, not this lane, green on a runner. REQUESTS §26. |
| 3 · turbo test:smoke | **UNRUN.** REQUESTS §25. |
| 4 · prettier --check . | **PASS** — exit 0. |
| 5 · turbo build | **PASS** — exit 0, 2m4s, not cached. |

**CI cross-check:** run 32941480874 on `888f226` — `typecheck · lint · test ·
format` **success** (10m54s), smoke **skipped**. One run for the commit.
