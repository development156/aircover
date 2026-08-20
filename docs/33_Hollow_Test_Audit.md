# Hollow-test audit — wt-hollow, 2026-08-20

Every number here is MEASURED unless marked INFERRED. Method: run the runner and
print what it reports; where reading the code could not settle a question, break
the thing under test and watch what happens.

---

## 0. The baseline, before anything was changed

`vitest run --reporter=json` per workspace, then the root `scripts/` config.
Raw output: `ops/hollow/baseline-2026-08-20.txt` (committed at `83accfa`, before
the first fix).

| package             | files | passed | failed | **skipped** |
| ------------------- | ----: | -----: | -----: | ----------: |
| apps/jobs           |    24 |    264 |      0 |          16 |
| apps/web            |   245 |   3303 |      0 |           7 |
| packages/billing    |    23 |    270 |      0 |      **26** |
| packages/db         |    22 |    201 |      0 |     **202** |
| packages/mesh       |    17 |    116 |      0 |           0 |
| packages/publishing |    16 |    261 |      0 |           0 |
| packages/research   |     7 |     67 |      0 |           0 |
| packages/shared     |    17 |    198 |      0 |           0 |
| packages/sites      |    53 |   1566 |      0 |           0 |
| root `scripts/`     |    10 |    174 |      0 |           0 |
| **total**           |       | **6420** |  **0** |     **251** |

**Twenty files ran zero tests and reported green.** `packages/db` skipped more
than it ran.

Two structural facts sit above the table:

- **All nine packages run `vitest run --passWithNoTests`.** That flag is the
  mechanism that turns "the glob matched nothing" into exit 0. Five package
  `vitest.config.ts` files carry comments saying exactly that is how
  shared/publishing/mesh/billing/sites each had their whole suite silently
  uncollected — roughly two thousand tests, none running, all green.
- **All nine packages declared `"lint": "exit 0"`.** `design-lint.mjs` does not
  exist on this branch (`find` returns nothing; `apps/web`'s lint was literally
  `"exit 0"`), so the brief's wt-screens exception did not apply.

---

## 1. The hollow-test table

`what it claims` → `what it actually runs` → verdict. Everything in the
**verdict** column was produced by executing something, not by reading it.

### 1a. Suites that reported success having run nothing

| file | claims | actually ran | verdict |
| --- | --- | --- | --- |
| `packages/db/tests/rls.test.ts` | RLS tenant isolation | 0 of 45 | **HOLLOW — now covered** |
| `packages/db/tests/ops_rls.test.ts` | ops platform isolation | 0 of 49 | **HOLLOW — now covered** |
| `packages/db/tests/brand_memory.test.ts` | `resolve_brand_memory` | 0 of 28 | HOLLOW (live-only) |
| `packages/db/tests/ops_human_writes.test.ts` | human write path | 0 of 18 | HOLLOW (live-only) |
| `packages/db/tests/ops_credits.test.ts` | credit maker-checker | 0 of 15 | HOLLOW (live-only) |
| `packages/db/tests/connections.test.ts` | `upsert_connection` | 0 of 10 | HOLLOW (live-only) |
| `packages/db/tests/ledger.test.ts` | `apply_ledger_entry` | 0 of 9 | HOLLOW (live-only) |
| `packages/db/tests/bootstrap.test.ts` | `bootstrap_workspace` | 0 of 9 | HOLLOW (live-only) |
| `packages/db/tests/sweep.test.ts` | `sweepStaleFixtures` | 0 of 5 | HOLLOW (live-only) |
| `packages/db/tests/ops_changelog_author.test.ts` | author cycle | 0 of 5 | HOLLOW (live-only) |
| `packages/db/tests/billing_provider.test.ts` | provider CHECK | 0 of 4 | HOLLOW (live-only) |
| `packages/db/tests/ops_qa_import.test.ts` | QA import attribution | 0 of 3 | HOLLOW (live-only) |
| `packages/billing/.../entitlements.integration.test.ts` | entitlements + the plans↔catalog release gate | 0 of 13 | **HOLLOW — now runs** |
| `packages/billing/src/withCredits.integration.test.ts` | the ledger wrapper | 0 of 6 | **HOLLOW — now runs** |
| `packages/billing/.../webhooks.integration.test.ts` | webhook idempotency | 0 of 6 | **HOLLOW — now runs** |
| `packages/billing/.../applyPlanGrant.integration.test.ts` | plan grant | 0 of 1 | **HOLLOW — now runs** |
| `apps/jobs/tests/publishStore.integration.test.ts` | publish store column drift | 0 of 9 | **HOLLOW — now runs** |
| `apps/jobs/tests/holds.integration.test.ts` | expired-hold reaper | 0 of 7 | **HOLLOW — now runs** |
| `apps/web/src/lib/inbox/live.integration.test.ts` | live Zernio reads | 0 of 4 | HOLLOW (live-only) |
| `apps/web/src/lib/privacy/export-drift.test.ts` | export drift | 0 of 2 | HOLLOW (live-only) |

A **skipped** test is honest — vitest prints it. What is not honest is a *gate*
whose only evidence for a property is a suite that never runs. That distinction
drives every fix below: the skips were not loosened, the properties were given
somewhere else to be proven.

### 1b. Guards that passed by not looking

Found by re-pointing each guard's corpus at `ops/state` — a directory that
**exists** (so nothing throws; a throw would be red for the wrong reason) and
contains four `.json` files and not one `.ts`. Spec:
`mutations/hollow-corpus-vacuity.mjs`.

| file | corpus emptied → | verdict |
| --- | --- | --- |
| `apps/web/src/lib/design/breakpoints.test.ts` | `Tests 2 passed` | **VACUOUS — fixed** |
| `apps/web/src/lib/design/phantom-denominator.test.ts` | `Tests 1 passed` | **VACUOUS — fixed** |
| `apps/web/src/lib/design/eyebrow.test.ts` | 1 failed | sound |
| `apps/web/src/lib/design/ink-faint.test.ts` | 2 failed | sound |
| `apps/web/src/lib/nav/reachable.test.ts` | 2 failed | sound |
| `apps/web/src/components/server-event-handler.guard.test.ts` | 1 failed | sound |
| `apps/web/src/lib/repo/test-collection.test.ts` | 1 failed | sound, but see below |
| `packages/sites/src/source-bytes.test.ts` | failed | sound (`MIN_EXPECTED_SOURCES`) |

`breakpoints.test.ts` guards the dead `sm:` `md:` `lg:` prefixes — the most
expensive defect this design system has had (fifteen classes across thirteen
files emitting no CSS, no warning, permanently single-column). Its guard was
passing on an empty tree.

**`test-collection.test.ts` has a hole its own mutation cannot show.** It counts
test files under `src/` only. `packages/db` keeps 22 test files under `tests/`
and `apps/jobs` keeps 2 — twenty-four files that guard cannot see at all. If
`packages/db/vitest.config.ts` were deleted, all 22 would go uncollected,
`--passWithNoTests` would return 0, and the guard would not fire. Closed by the
new `uncollected-tests` lint rule, which counts both.

### 1c. Playwright specs the gate cannot reach

MEASURED: `playwright test --list` → **76 tests in 19 files**;
`--grep @smoke` → **67 tests in 17 files**. Nine tests are unreachable by the
gate.

| spec | total | in `@smoke` | verdict |
| --- | ---: | ---: | --- |
| `assets.spec.ts` | 8 | 1 | **honest** — see below |
| `design-audit.spec.ts` | 1 | 0 | a screenshot tool; its `@smoke` string is in a COMMENT |
| `shell-probe.spec.ts` | 1 | 0 | no tag at all — **fixed** |

**A correction to my own first reading.** `assets.spec.ts`'s seven untagged tests
looked like the biggest item here and are not a finding. The file says in its own
header why: *"It uploads bytes to real storage and it is slower than the gate
wants. It is run explicitly. The gate's `--grep @smoke` deliberately does not
pick it up."* A documented, reasoned exclusion is the opposite of a hollow test —
same class as the six `*.live.test.ts` files. Only `shell-probe.spec.ts` was
untagged for no stated reason, and only it was changed.

The worktree's own `CLAUDE.md` states *"All 15 e2e tests are tagged `@smoke`, so
the gate runs every one of them."* The runner reports 76 tests in 19 files, 67
tagged. The documented claim is contradicted by the runner — and, given the
paragraph above, tagging the remaining nine is not the fix; correcting the
sentence is.

### 1d. Files with test blocks and zero `expect()`

| file | blocks | verdict |
| --- | ---: | --- |
| `apps/web/e2e/shell-probe.spec.ts` | 3 | **HOLLOW — now asserts, now tagged** |
| `apps/web/e2e/design-audit.spec.ts` | 4 | not a test — a screenshot tool; now a NAMED exception |
| 6 × `*.live.test.ts` | 9 | honest — excluded from `turbo test` by config, run by hand, output is the artefact |

---

## 2. Fixed, each with the mutation proving it

| what | mutants | spec |
| --- | --- | --- |
| two vacuous design guards | **8/8 killed** | `mutations/hollow-corpus-vacuity.mjs` |
| RLS + the append-only ledger | **8/8 killed** | `mutations/rls-enforced.mjs` |
| 26 billing integration tests | **6/6 killed** | `mutations/billing-integration-executes.mjs` |
| 16 jobs integration tests | **3/3 killed**, 2 recorded as wrong-mutants | `mutations/jobs-integration-executes.mjs` |
| every lint rule + the ratchet | **6/6 killed** | `mutations/lint-rules-fire.mjs` |

Counts, before → after:

| package | before | after |
| --- | --- | --- |
| `packages/billing` | 270 passed / **26 skipped** | **302 passed / 0 skipped** |
| `apps/jobs` | 264 passed / **16 skipped** | **280 passed / 0 skipped** |
| `packages/db` | 201 passed / 202 skipped | 213 passed / 202 skipped (12 new, always-run) |

### 2a. RLS: zero executing tests enforced a policy

`pglite-schema.ts` states, and had stated since it was written:

> Row-level security policies are CREATED here but not exercised: PGlite
> connects as a superuser, which bypasses them. Tests may assert that RLS is
> switched on — a structural fact — and must not claim a policy was enforced.

True of the default connection, false of what the connection can be made to do.
MEASURED, in three statements:

```
begin;
set local role authenticated;   -- current_user=authenticated, is_superuser=off
select * from t;                -- 2 rows seeded, 1 returned
```

All 44 migrations boot on PGlite: **48 tables, all with RLS on, 89 policies, 30
carrying `workspace_id`**. The new suite seeds two workspaces into all 30 — the
table list read from `information_schema`, never a hand-written array — and
asserts isolation in both directions, plus `anon`, plus attempted theft. Nine
tests, no credentials, no network, ~2.5s.

Three ways it could have passed while proving nothing, each with its own
assertion:

1. **The role never drops.** Every policy is inert against a superuser and all
   30 tables "pass". `is_superuser` is asserted `off` inside the transaction.
2. **The GRANTs are missing.** A bare Postgres gives `authenticated` no table
   privileges, so every read returns `permission denied` — which looks exactly
   like flawless isolation. Supabase grants `anon` and `authenticated` full CRUD
   at project creation, because in its model the GRANT is not the boundary; RLS
   is. Reproduced. Narrowing it would have made the suite *look* stronger and be
   worthless. Found the hard way: `ai_provider_logs` denied its own owner.
3. **Nothing is seeded**, so "B's rows are invisible" is trivially true.
   Per-workspace row counts are asserted before any filtering.

A fourth: a table quietly losing its SELECT policy would be reclassified as
"intentionally service-only" *by the check meant to catch it*. So the
service-only and operator-only sets are derived from `pg_policies` **and**
asserted against declared lists.

The 94 live RLS tests are not deleted. Against production they check things this
cannot.

### 2a-bis. Two defects in my own harness, both found by mutation

**The seeder disarmed the whole database and never re-armed it.**
`seedTwoWorkspaces` runs `alter table … disable trigger all` so it can insert
without fighting foreign keys, and it did not put them back. Every later
assertion therefore ran against a Postgres with `app.block_mutations()` globally
disabled — a harness quietly telling its own tests what to conclude. Fixed, and a
mutant that skips the re-arm is killed.

**That disarming was hiding a real gap.** No EXECUTING test covered the ledger's
append-only guarantee. `post_metric_snapshots.pglite.test.ts` covers the guard
for `post_metric_snapshots`; `ledger.test.ts` covers `credit_ledger` and is
`describe.skipIf(!hasLedgerEnv)`, so it has never run. MEASURED: dropping the
trigger from `credit_ledger` left every test in `apps/jobs` and
`packages/billing` green.

Now covered for every table carrying the trigger, the list read from
`pg_trigger`. `ops_audit_log` is DECLARED unpopulated rather than filtered
silently: a `FOR EACH ROW` trigger cannot fire on an empty table, so a DELETE
there succeeds trivially and reads as a defect that is not one.

### 2c. apps/jobs: 264 passed / 16 skipped → 280 passed / 0 skipped

`publishStore.integration.test.ts` describes itself as *"the only thing that
catches drift between `post_publish_logs`' DDL and the row this job writes"*. It
had never run. The mutant that drops a column the job writes now kills it.

**Two mutants here were written, SURVIVED, and are recorded in the spec as wrong
mutants rather than as holes** — because reporting an equivalent mutant as a gap
is the same error in the other direction:

- *removing the Supabase GRANTs.* These suites connect as PGlite's superuser and
  never `set role`, exactly as the job does through a service-role pool, so table
  privileges cannot affect them. The grants were inert setup and are deleted from
  that helper rather than left there looking like coverage. They ARE load-bearing
  in `packages/db`'s harness, which drops to `authenticated`.
- *dropping the append-only trigger.* Out of scope for these two files. It was a
  real gap in the repo, just not here — now covered where it belongs.

### 2d. One prelude, not three

Three harnesses boot this schema on PGlite. The Supabase prelude was on its way
to being three copies of one TypeScript template literal, which is exactly how a
schema drifts one role at a time while all three report green. It is now
`packages/db/tests/helpers/supabase-prelude.sql`, read from disk by all three.

### 2b. Billing: 270 passed / 26 skipped → **302 passed / 0 skipped**

The skip was never the mistake — the only Postgres this repo points at is
production, and these suites ran against it on 2026-07-27, which is why the gate
exists. Having no other database was the mistake. They now open one either way:
PGlite from `packages/db`'s real `.sql` files by default, the live DSN when
opted in. Each suite asserts which it got.

**The plans↔`PLAN_CATALOG` drift guard — a release check — executed for the
first time and PASSES.** The seed and the catalog agree on this branch. That
says nothing about production's `plans` table, which still needs the live suite.

**Found by mutation, then fixed:** dropping `credit_ledger`'s
`UNIQUE (idempotency_key)` left all 37 billing tests green. Idempotency is really
enforced by `select … for update` on `credit_balances` inside
`apply_ledger_entry`, which serialises applies per workspace; the UNIQUE index is
the layer beneath that and nothing covered it. Two tests added.

**Not covered, and it cannot be here:** the actual concurrent race. PGlite is one
connection, so two applies execute serially and a `Promise.all` would prove
serial replay while claiming to prove a race. Said so in the test; it belongs to
the live suite.

---

## 3. Lint: `exit 0` → rules that can fail, in every package

Five rules, each aimed at a way a suite here has been observed to report success
while checking nothing.

| rule | what it catches | proven red by |
| --- | --- | --- |
| `test-only` | a stray `.only` silently skips the rest of its file | planting `describe.only` |
| `assertionless-test` | test blocks, zero `expect()` | withdrawing a declared exception |
| `stale-exception` | an exception naming a file that no longer qualifies | pointing one at an asserting file |
| `uncollected-tests` | a vitest include that cannot reach the package's own tests | giving `packages/db` an `src/`-only include |
| `console-log` | debug output in shipped source | planting one |

Plus the ratchet itself: `--update-baseline` was mutated to accept a **raised**
count and the run went red. A baseline that can be raised is not a ratchet, and
that failure is invisible from a passing `lint` run.

**Ratchet, not hard fail** — three sessions are live in parallel worktrees, and a
rule that reds their gates on files they are mid-edit gets switched off.
Baselines live in `ops/lint-baselines/`. `--update-baseline` seeds once and
thereafter refuses to raise.

**MEASURED: editing `scripts/lint.mjs` takes turbo from `9 cached` to
`0 cached`.** Without the `globalDependencies` + task `inputs` added to
`turbo.json`, a rules change would have replayed a stale FULL TURBO pass over an
unchecked tree — the root-file blind spot this repo has hit before.

Two earlier attempts at the `assertionless-test` mutant SURVIVED, and both times
the **mutant** was wrong rather than the rule: it counts the literal text
`expect(`, so aliasing or shadowing the binding leaves every call site intact.
Recorded in the spec rather than quietly replaced.

---

## 4. Corrections to things stated as fact elsewhere

| claim | where | measured |
| --- | --- | --- |
| "All 15 e2e tests are tagged `@smoke`" | worktree `CLAUDE.md` | 76 tests in 19 files; 67 tagged |
| "RLS policies … must not claim a policy was enforced" | `pglite-schema.ts` | `set local role` drops superuser; policies apply |
| "the Stop-hook gate … does NOT cover [`scripts/`]" | root `vitest.config.ts` | `pnpm gate` stage 2 is `vitest-root`, which does |
| the `@smoke` suite is "63 tests" | the brief | 67 tagged, 76 total |
