# Handoff — karunesh — wt-karunesh — 2026-08-27

**Branch** `wt-karunesh` at `923f08b`. Lane `wt-karunesh`. Pushed: yes (local and `origin/wt-karunesh` are the same SHA, MEASURED).

This is the first handoff filed for this lane. It set out to write no code, ran the gate,
and found the gate red for reasons nobody had recorded. Two of those were fixed here. The
findings, not the diff, are the content of this file.

**Section 2 of this file was rewritten after a claim in it was refuted by further
measurement.** The refutation is kept in place rather than edited away — see *Anything
retracted*.

## What shipped

| Item | Proof | Test that covers it |
| --- | --- | --- |
| `git config sahoda.owner=karunesh`, `sahoda.lane=wt-karunesh` | local git config, MEASURED | none — repo config, not code |
| This handoff | `docs/workflow/handoffs/karunesh-wt-karunesh-2026-08-27.md` | none |
| `export-drift` skips on REACHABILITY, not on "is the URL string set" | `bf9a2bf`, `apps/web/src/lib/privacy/export-drift.test.ts:57-104` | itself: the file now reports `1 skipped` here instead of `2 failed`, and prints why |
| vitest's dev-machine worker cap is a cut on every machine, not only a 12-core one | `129b813`, `apps/web/vitest.config.ts:74` | the whole `@sahoda/web` suite: 3 full runs red before, 2 full runs green after |

Both are test-infrastructure fixes for defects that made the gate red on a lane whose only
other commit is a markdown file. Neither touches product code.

## What was NOT done, and why

- **I did not run Playwright.** Every @smoke spec signs in through Clerk, and in this
  sandbox Chromium cannot complete an outbound HTTPS request at all (CLAUDE.md, REQUESTS
  §25). That leg is **UNRUN**, not passed.
- **I did not fix the `@sahoda/db` live-guard assertion.** It is a defect in a
  *live-database safety guard*, and rewiring an assertion inside the guard that stopped a
  production write on 2026-07-27 wants its own session and its own reviewer. It also does
  **not** make the gate red (measured below: it fails only when `packages/db` is run
  directly, bypassing turbo), so fixing it was not forced. It is the first item under
  "next session".
- **I did not prove the worker cap by mutation**, because starvation has no single line to
  break. The evidence is statistical and I have written the actual counts rather than
  calling it fixed: 3 full runs red before, 2 full runs green after. Two runs is not
  proof.
- **I did not touch `wt-core`.** Nothing to give it.

## Shared surfaces touched

**One: `apps/web/vitest.config.ts`.** It is not a shared *package*, but every session that
runs `@sahoda/web` tests on a machine that is not CI now gets a different worker count
(`Math.min(4, Math.max(2, cpus - 2))` instead of a flat `4`). On the 12-core laptop the
original was measured on, this still resolves to **4** — the value that session measured is
preserved exactly, deliberately. On a 4-core box it now resolves to **2**, which is the
change. It **reads** configuration, it breaks no constructor, and no other package imports
it. Expect the web suite to take slightly longer on small machines and to stop losing
races.

No token, type, fixture, schema or shared primitive was edited.

## Contract, migration or money

**None.** No change to `packages/shared`, no migration, no price, no ledger call.

## Guards written, and the mutation that proved each

**One repaired, and the mutation was run and watched.**

`export-drift.test.ts` — the repaired skip condition. **The mutation:** replace
`const describeWithDb = (await databaseIsReachable()) ? describe : describe.skip` with
`= true ? describe : describe.skip`, forcing the probe's answer to be ignored.
**MEASURED, watched go red:** `Test Files 1 failed / Tests 2 failed`, `getaddrinfo
ENOTFOUND`. Restored, and it returns to `1 skipped / 2 skipped`. So the probe, and not
something incidental, is what produces the skip.

A second thing was caught by insisting the skip be *visible*: the first version used
`console.warn` and **printed nothing**. MEASURED — vitest attributes console output to a
running test, and this runs during module evaluation with every test about to skip. A skip
nobody can see is the exact failure mode the probe exists to prevent, so it now writes to
`process.stderr` directly and the line does appear. That is the one rule in this repo
applied to my own repair: a guard never shown to work is not a guard.

## Anything retracted

Nothing retracted. One thing **newly measured** that the lane did not previously record:

**`packages/db/tests/live-guard.test.ts:31` fails in this sandbox, reproducibly, and its
assertion does not test what its name claims.**

MEASURED — but **narrower than I first wrote**, and the correction matters:

| Run | Command | Result |
| --- | --- | --- |
| direct, bypassing turbo | `pnpm run test` in `packages/db` | **FAIL**, 1 of 869 (661 passed, 207 skipped) |
| under turbo, filtered | `turbo run test --filter=@sahoda/db --force` | **PASS** — live-guard 4 tests, 1 skipped |
| under turbo, full gate | `turbo run test --force` x2 | **PASS** both times |

The test is named *"does not read the repo-root .env while the flag is absent"* but it
asserts `ENV.dbUrl === ''`. Those are two different claims. `helpers/env.ts:37` reads
`process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''`, so the assertion is
satisfied only when that variable is *also* absent from the ambient shell — which has
nothing to do with whether dotenv opened the file. In this environment
`SUPABASE_DB_URL` **is** set ambiently (MEASURED via `process.env`; `DATABASE_URL` is
not, `SAHODA_ALLOW_LIVE_TESTS` is `undefined`), because `scripts/cloud-setup.sh` now
provisions the sandbox from environment variables. So the guard goes red on a machine
where nothing it guards is actually wrong.

**The safety property itself is intact.** `LIVE` is false, so `loadEnv` never ran,
`assertTargetIsNotProduction()` never ran, and both `hasLedgerEnv` and `hasRlsEnv` are
false — the other two assertions in the same file passed. No live suite executed against
production. What is broken is the *proxy* the third assertion uses, not the gate.

Two consequences worth naming:

1. **The failure output printed a live Postgres connection string, password included,**
   into the terminal, because the assertion diffs `ENV.dbUrl` against `''`. A guard whose
   failure mode is "print the production credential" is a second defect sitting inside
   the first.
2. **This is what I got wrong, and the correction is the useful part.** My first draft of
   this section said the failure reproduced _under turbo_, and inferred from that that
   turbo's strict mode was leaking `SUPABASE_DB_URL` — the same class of hole R-01
   documents. **Refuted.** Three later turbo runs all passed. Strict mode is doing its
   job: `turbo.json` declares only `SAHODA_ALLOW_LIVE_TESTS` on the `test` task, and
   `SUPABASE_DB_URL` is stripped before vitest sees it. The one contrary data point was
   the very first full run, which reported `Tasks: 15 successful, 17 total` while naming
   only `@sahoda/web#test` as failed; I read the interleaved `@sahoda/db:test:
   [ELIFECYCLE]` line as a second failure. I cannot reproduce it and I will not defend it.
   **The standing measurement is: turbo protects this, running `packages/db` by hand does
   not.** So the assertion is a trap for whoever runs that package directly, not a
   gate-blocker.

### The second finding: the worker cap was a cut on one machine only

**MEASURED.** Three full `@sahoda/web` runs on this commit failed in three DIFFERENT files,
every one of them green in isolation:

| Run | File that lost the race | Alone |
| --- | --- | --- |
| 1 | `src/components/composer/one-fill.test.tsx:221` — `findByRole` timeout | 6/6 pass, 7.0s |
| 2 | `src/lib/privacy/export-drift.test.ts` — the separate defect above | now skips |
| 3 | `src/lib/repo/workspace-timezone.pglite.test.ts` — suite-level, 0 failed tests | 15/15 pass, 6.5s |

That shape is already written into this repo. `eb5224b`, one commit below mine on this
lane, has a commit message describing FOUR runs of one commit failing in four different
files, and it fixed the cause: `maxWorkers: process.env.CI ? undefined : 4`.

It under-corrected. A flat `4` is a real cut on the 12-core laptop it was measured on and
**no cut at all here** — `os.cpus().length` is 4 (MEASURED), so vitest would have used 4
anyway and the cap did nothing. The symptom came straight back.

`apps/web/vitest.config.ts:74` now expresses the cut as a cut:
`Math.min(4, Math.max(2, cpus().length - 2))`. On 12 cores that is still exactly **4**, so
the value the earlier session measured is preserved rather than overwritten. On 4 cores it
is **2**.

**Result, MEASURED:** two consecutive full forced gate runs, 27 of 27 tasks green
(5m26s, 5m15s). Before the change, three of three were red. **Two runs is evidence, not
proof** — starvation is probabilistic and I will not claim it is solved. If a fourth
random file goes red on a later run, the cap wants to go to `cpus - 2` with no ceiling,
not another per-file timeout bump. Patching whichever file lost the race is fitting the
code to a broken machine, which is the mistake `eb5224b` was written to stop.

## What the next session in THIS lane should pick up

1. **Fix `packages/db/tests/live-guard.test.ts:31` — carefully.** Make the assertion test
   its own name: the claim is "dotenv did not open the file", so assert *that* (spy on the
   loader, or snapshot `process.env` across the import and assert no key arrived from the
   file), not "the variable happens to be empty". Do not delete it, and do not `skipIf` it
   on an ambient variable — that re-arms the hole its header warns about. **And stop the
   credential printing:** assert a boolean or a redacted shape so a failure never puts the
   password on screen. **Prove it by mutation:** remove the `if (LIVE)` wrapper around
   `loadEnv` in `helpers/env.ts` and watch the repaired test go red. If it stays green the
   repair is worthless. This does not block the gate, so it can be done properly.
2. **Then start actual lane work.** The gate is green and the lane has a clean base.
3. **If a full run goes red in a file that passes alone, do not touch that file.** Read
   the worker-cap section above first.

## Gate

Each leg, forced (no cache replay), never piped. **Final state, MEASURED:**

| Leg | Command | Time | Result |
| --- | --- | --- | --- |
| format | `prettier --check .` | 58.7s | **PASS** — "All matched files use Prettier code style!" |
| typecheck + lint + test | `turbo run typecheck lint test --force` | 5m26s | **PASS** — 27 successful, 27 total, 0 cached |
| test, second run | `turbo run test --force` | 5m15s | **PASS** — 17 successful, 17 total, 0 cached |
| test:smoke (Playwright) | not run | — | **UNRUN** — Chromium has no outbound HTTPS in this sandbox |

`@sahoda/web` finishes 452 files / 5721 tests passed, 3 files / 13 tests skipped. Two of
those skips are `export-drift`, and it says on stderr why.

**Where it started**, kept because the path matters more than the endpoint. Three full runs
before the fixes, three different reds, each green alone: `one-fill.test.tsx:221`,
`export-drift.test.ts` (2 tests), `workspace-timezone.pglite.test.ts`. Failures grouped by
message, never counted — two unrelated messages across runs, one of them not reproducible,
which is what said "starved machine" rather than "bad diff".

Still UNRUN: Playwright. Every @smoke spec signs in through Clerk, and Chromium here cannot
complete an outbound HTTPS request (CLAUDE.md, REQUESTS §25). That leg is UNRUN, not
passed, and this lane has not been smoke-tested.

## In plain terms

The plan was to write a record of this lane and change nothing. The routine health check
came back failing, so the session became about that instead.

Two separate things were wrong, and both were the same kind of wrong: a check written for
a machine that no longer exists.

The first is a test that compares our list of customer data against the real database. It
was built to sit quietly when there is no database to ask — sensible, since a complaint
about a database you cannot reach tells you nothing. But it decided "there is no database"
by looking for an address rather than trying the door. This machine has been given an
address it cannot actually reach, so the test kept knocking, failing, and, worse, printing
the real database password on screen each time. It now tries the door, and when it cannot
open it, says so plainly and stands down.

The second is that the whole test suite was running too many things at once for a machine
this small, so a different test fell over each time purely from being starved of resources.
Someone hit this before and put a limit in, but the limit was a real limit only on their
larger computer. It is now written as a proportion of whatever machine it runs on, and set
so their computer keeps the exact setting they measured.

After both, the full check passed twice in a row, having failed three times in a row
before. Two clean runs is encouraging rather than conclusive, and the record says so.

One problem was found and deliberately left alone: a safety alarm in the database package
that goes off wrongly, and also prints the password. It only misfires when someone runs that
package by hand, so it is not blocking anyone. Rewiring an alarm that once stopped a real
accident deserves its own sitting, not five minutes at the end of another job.
