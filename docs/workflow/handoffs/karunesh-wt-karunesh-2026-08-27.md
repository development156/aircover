# Handoff — karunesh — wt-karunesh — 2026-08-27

**Branch** `wt-karunesh` at `923f08b`. Lane `wt-karunesh`. Pushed: yes (local and `origin/wt-karunesh` are the same SHA, MEASURED).

This is the first handoff filed for this lane. The session wrote no product code. It
pinned the lane identity, ran four gate legs, and found one reproducible red that nobody
had recorded. That red is the whole content of this file.

## What shipped

| Item | Proof | Test that covers it |
| --- | --- | --- |
| `git config sahoda.owner=karunesh`, `sahoda.lane=wt-karunesh` | local git config, MEASURED | none — repo config, not code |
| This handoff | `docs/workflow/handoffs/karunesh-wt-karunesh-2026-08-27.md` | none |

No source file was edited. `git status --short` was empty at session start and holds only
this handoff at session end (MEASURED).

## What was NOT done, and why

- **I did not run Playwright.** Every @smoke spec signs in through Clerk, and in this
  sandbox Chromium cannot complete an outbound HTTPS request at all (CLAUDE.md, REQUESTS
  §25). That leg is **UNRUN**, not passed.
- **I did not fix the `@sahoda/db` failure below.** It is a defect in a *live-database
  safety guard*. Changing an assertion inside the guard that stopped a production write on
  2026-07-27 is not a drive-by edit inside a handoff command; it wants its own session, its
  own mutation proof and its own reviewer. It is the first item under "next session".
- **I did not touch `wt-core`.** Nothing to give it.

## Shared surfaces touched

**None.** No token, type, fixture, schema, config or shared primitive was edited.

## Contract, migration or money

**None.** No change to `packages/shared`, no migration, no price, no ledger call.

## Guards written, and the mutation that proved each

**None written.** Nothing to prove.

## Anything retracted

Nothing retracted. One thing **newly measured** that the lane did not previously record:

**`packages/db/tests/live-guard.test.ts:31` fails in this sandbox, reproducibly, and its
assertion does not test what its name claims.**

MEASURED, twice:

| Run | Command | Result |
| --- | --- | --- |
| under turbo | `pnpm exec turbo run test --force` | `@sahoda/db#test` FAIL, 1 test |
| direct, isolated | `pnpm run test` in `packages/db` | FAIL, 1 of 869 (661 passed, 207 skipped) |

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
2. **INFERRED, not measured:** `turbo.json` declares neither `envMode`, `globalEnv` nor
   `globalPassThroughEnv`, and the `test` task's `env` list holds only
   `SAHODA_ALLOW_LIVE_TESTS` — yet `SUPABASE_DB_URL` still reached vitest under turbo.
   Either strict mode is not in force here or something else is passing it through. That
   is the same class of hole R-01 documents. I did not chase it down; whoever fixes the
   assertion should measure it.

One further **MEASURED** result, recorded so nobody mistakes it for a defect:
`apps/web src/components/composer/one-fill.test.tsx:221` failed inside the full run
(`findByRole('button', { name: /Confirm…/ })` timed out) and **passed 6/6 in 7.0s when run
alone**. That is starvation under full-suite load, the same shape as `a964402`, not a diff.

## What the next session in THIS lane should pick up

1. **Fix `live-guard.test.ts:31` — carefully.** Make the assertion test its own name:
   the claim is "dotenv did not open the file", so assert *that* (spy on the loader, or
   snapshot `process.env` before and after import and assert no key arrived from the
   file), not "the variable happens to be empty". Do not delete the test and do not
   loosen it to `skipIf` on an ambient variable — that re-arms exactly the hole the
   header warns about. **And stop the credential printing:** assert on a boolean or a
   redacted shape so a failure never puts the password on screen.
   **Prove it by mutation:** delete the `if (LIVE)` wrapper around `loadEnv` in
   `helpers/env.ts` and watch the repaired test go red. If it stays green, the repair is
   worthless.
2. Then re-run `@sahoda/db` alone and confirm 0 failed.
3. Only after that does this lane have a clean base to build on.

## Gate

Each leg, real output, forced (no cache replay).

| Leg | Command | Time | Result |
| --- | --- | --- | --- |
| format | `prettier --check .` | 58.7s | **PASS** — "All matched files use Prettier code style!" |
| typecheck | `turbo run typecheck --force` | 42.3s | **PASS** — 9 successful, 9 total, 0 cached |
| lint | `turbo run lint --force` | 3.3s | **PASS** — 9 successful, 9 total, 0 cached; 1373 files scanned in apps/web/src |
| test (vitest) | `turbo run test --force` | 4m52s | **FAIL** — 15 of 17 tasks successful; `@sahoda/db#test` and `@sahoda/web#test` red |
| test:smoke (Playwright) | not run | — | **UNRUN** — Chromium has no outbound HTTPS in this sandbox |

Failures grouped by error message, not counted:

- **`packages/db/tests/live-guard.test.ts:31`** — `expected 'postgresql://…' to be ''`.
  Reproduces in isolation. Real, diagnosed above. Blocks the gate.
- **`apps/web/src/components/composer/one-fill.test.tsx:221`** — `findByRole` timeout.
  Does **not** reproduce in isolation (6/6 pass). Load starvation.

Two red suites, two unrelated messages, one of them not reproducible — so this is not an
environment-wide collapse. `@sahoda/db` is the one that needs a diff.

## In plain terms

Nothing was built today. The lane was set up, given a name, and checked over. Three of the
four checks that could run came back clean. The fourth found a genuine problem: a safety
alarm — the one that stops test code from touching the real customer database — is going
off on this machine even though nothing dangerous is happening. The alarm is wired to the
wrong wire. It is checking for something that only happens to line up with the real danger
most of the time, and here it does not line up, so it screams for no reason. Worse, when it
screams it prints the real database password onto the screen. The database is safe; the
alarm is not trustworthy. Fixing that alarm is the next job, and it should be done on its
own, not squeezed in beside something else.
