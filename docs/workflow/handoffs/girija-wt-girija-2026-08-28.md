# Handoff — girija — wt-girija — 2026-08-28

**Branch** `claude/lead-research-tz63ld` at `d5be2d56`. Lane `wt-girija`. Pushed: **yes**.
PR #13, draft, open. The harness pinned this session to that `claude/...` branch and it
cannot leave; `git config sahoda.lane` is `wt-girija`, which is the record that matters.

A short session. One task was given and one thing was done. Everything below is that,
plus the trunk merge that had to happen first.

---

## What shipped

| # | What | Proof | Covered by |
| --- | --- | --- | --- |
| 1 | `wt-core` taken into this lane: 140 commits, 317 files, +40,638 / -2,678, **CLEAN** | `4e859b58`, `node scripts/lane-sync.mjs pull` | n/a — a merge, not a change |
| 2 | The export-manifest guard stands down with **"no route to production"** instead of failing with `ENOTFOUND` | `d5be2d56`, `apps/web/src/lib/privacy/export-drift.test.ts:107` | `apps/web/src/lib/privacy/db-route.test.ts` (23 tests) |
| 3 | `noRouteReason` — the classifier, four errno codes wide | `apps/web/src/lib/privacy/db-route.ts:47` | same file, both directions asserted |
| 4 | `readOrStandDown` — read, or stand down with a reason, rethrowing anything else | `apps/web/src/lib/privacy/db-route.ts:81` | same file, 4 tests |

### Why item 2 exists

MEASURED at kickoff: `pnpm gate` was red on an **untouched tree**, two tests in
`export-drift.test.ts`, both `getaddrinfo ENOTFOUND db.<ref>.supabase.co`.

The cause is not the code. That file was written to skip when `SUPABASE_DB_URL` is
absent, and the cloud sandbox had no `.env` — until 2026-08-24, when
`scripts/cloud-setup.sh` began writing one. The credential is now present and the host
still is not reachable: MEASURED, `db.<ref>.supabase.co` resolves **AAAA-only**
(`getent ahostsv4` returns nothing) and this sandbox has no IPv6 route, so the packet
never leaves. A skip became a failure, and the failure named the export manifest for a
fault in the machine.

MEASURED: `git diff --stat origin/wt-core HEAD` was **empty** at that point, so the red
was `wt-core`'s and not this lane's.

### The net is narrow on purpose

`ENOTFOUND`, `EAI_AGAIN`, `ENETUNREACH`, `EHOSTUNREACH` stand down. Everything else stays
red: `ECONNREFUSED` means a machine answered, `ETIMEDOUT` is indistinguishable from a
database too slow to answer, and every Postgres SQLSTATE means the host was reached. A
wrong password is a configuration defect, not an absent network. **Widening this set is
how a suite starts reporting green on nothing** — the comment in `db-route.ts` says so and
says to bring the measurement that justifies any addition.

### How loud the skip actually is

MEASURED, and stated because the file's own header claims it "SKIPS, loudly":

- `--reporter=verbose` prints the warn line and both skip reasons with the host and errno.
- The **default** reporter prints neither. Vitest 4 silences console output for anything
  that did not fail, and it compresses skip annotations. `ctx.annotate` was tried and is
  also not shown.
- What the ordinary gate shows is the **skipped count** — the same signal the
  no-credential skip has always given. The claim is not stronger than that.

---

## What was NOT done, and why

- **The @smoke leg is UNRUN, not passed.** Unchanged from yesterday: Chromium here
  completes no outbound HTTPS request and every `@smoke` spec signs in through Clerk.
  REQUESTS §25 carries the six measurements. Run it on the `smoke` job in
  `.github/workflows/gate.yml` before this lane merges.
- **One line of the change is uncoverable here.** If `if (rows === null) return ctx.skip()`
  were mutated to skip unconditionally, nothing in this repo would notice, because this
  sandbox cannot tell a real skip from a forced one. Catching it needs a reachable
  database inside the gate, which is a larger call than this change.
- **The two assertions themselves are untouched.** They were moved, not rewritten; the
  diff on them is whitespace and the removal of their per-test `30_000` budget, which now
  sits on the single `beforeAll`.
- Nothing was done about yesterday's four unapplied migrations, the 38 hardcoded
  `Asia/Kolkata` sites, or `docs/55` steps 5 through 11. No task was given for any of them.

---

## Shared surfaces touched

**None.** Three files, all new or private to `apps/web/src/lib/privacy`:

| File | Status |
| --- | --- |
| `apps/web/src/lib/privacy/db-route.ts` | new, imported by one test file |
| `apps/web/src/lib/privacy/db-route.test.ts` | new |
| `apps/web/src/lib/privacy/export-drift.test.ts` | modified |

No type, token, fixture, config or export that another lane consumes. `db-route.ts` is a
new module, so it breaks no constructor.

The merge in `4e859b58` moved a great deal underneath this lane — heaviest were assets
(53 files plus 20 in `lib`), composer (24), posts (21 plus 18), connections (17 plus 14).
That is other lanes' work arriving, not this lane's.

## Contract, migration or money

**None.** Nothing under `packages/shared`, no price, no migration, no ledger path.

---

## Guards written, and the mutation that proved each

Four mutations, each applied and **watched**:

| # | Mutation | Result |
| --- | --- | --- |
| 1 | Add `ECONNREFUSED` to the no-route set | RED: `keeps ECONNREFUSED red` fails — **and** a genuinely refused connection (`postgresql://…@127.0.0.1:1/postgres`) turned from FAIL into two silent skips. The failure mode, caught. |
| 2 | Stop walking the `cause` chain | RED: `reads a wrapped errno` fails |
| 3 | Delete the rethrow in `readOrStandDown` | **GREEN on the first measurement.** Nothing caught it. |
| 4 | Delete the rethrow, after the fix | RED: two tests fail |

**Mutation 3 is the finding.** Four lines inside a `beforeAll` cannot be asserted on from
inside their own file, so the read-or-stand-down decision was extracted into a function
and given four tests of its own. The measurement that proved it mattered: with the rethrow
gone, `127.0.0.1:1` — a host that is reachable and refusing — reported as two skipped
tests and nothing anywhere went red.

`db-route.test.ts` needs no database, so unlike the file it serves it runs on **every**
gate run. That is the point: it is the piece that can silence the guard.

## Anything retracted

**Yesterday's handoff said the root `vitest run` failure was the only environment leg
outside smoke. There are two more.** Both MEASURED today, both on code this lane did not
touch:

1. `packages/db/tests/live-guard.test.ts` fails **because this shell exports
   `SUPABASE_DB_URL`**. MEASURED both ways: `env -u SUPABASE_DB_URL -u
   SUPABASE_SERVICE_ROLE_KEY pnpm exec vitest run tests/live-guard.test.ts` → 3 passed,
   1 skipped. With the variables present → 1 failed. The file has not changed since
   `3c53e45a`, 2026-08-22.
2. `apps/jobs` `store.pglite.test.ts` ×2 — `Hook timed out in 30000ms`, in the gate run
   only. MEASURED: `apps/jobs` alone is **34 files, 396 tests, all passed**. This is
   exactly the starved-machine pattern `vitest.config.ts:33` documents, a different file
   each run, green in isolation.

### A finding this session did not fix

When `live-guard.test.ts` fails, its assertion diff **prints the production database URL
including the password** into the test output. Anyone reading a CI log or a pasted gate
result sees a live credential. The fix is to assert on a redacted form; it is one line in
a file this lane has no reason to touch, and it should be done by whoever owns
`packages/db`. **Not urgent only because the test is currently green everywhere the
variable is unset.**

---

## What the next session in THIS lane should pick up

1. **Run the @smoke leg somewhere with real network.** It has now been UNRUN for two
   sessions. Dispatch the `smoke` job on `.github/workflows/gate.yml` by hand.
2. **The four unapplied migrations, `20260823000000_dpdp_erasure` first.** If the
   "Delete everything" button reaches production without it, it fails on a legal
   obligation. `20260826210000_workspace_profile_cleared_on_erase` is written and blocked
   behind it.
3. The credential-in-test-output finding above.
4. `docs/55` step 6 — moving `tone_drift` to the Brand Brain — is unblocked and is the
   smallest remaining piece of the marketing-brain work.

---

## Gate

MEASURED at `d5be2d56`. `TURBO_FORCE=true`, 0 cached, output redirected to a file and the
exit code read separately, never piped.

| Leg | Result |
| --- | --- |
| `turbo typecheck lint` | **PASS** — 10/10 for `@sahoda/web`; `console-log=1` is pre-existing, measured on a stashed tree |
| `apps/web` vitest, full | **PASS** — 454 files passed, 2 skipped; 5,744 tests passed, 13 skipped, **0 failed**. Was 2 failed / 11 skipped before this commit. |
| `apps/jobs` vitest, full | **PASS** — 34 files, 396 tests, 0 failed |
| `packages/db` vitest | **FAIL ×1, not this lane's** — `live-guard.test.ts`, caused by this shell's exported `SUPABASE_DB_URL`. Passes with the variable unset. |
| `packages/{shared,mesh,publishing,sites,billing,research}` | **PASS** — 26 / 26 / 27 / 53 / 30+1 skipped / 13 files |
| `prettier --check .` | **PASS** |
| `turbo test:smoke` | **UNRUN** — see above. Not passed. |
| Whole-repo `TURBO_FORCE=true turbo typecheck lint test` | **FAIL** — 24 of 27 tasks successful. `@sahoda/jobs#test` failed on the two hook timeouts; `@sahoda/web` and `@sahoda/db` were **cancelled** by turbo when it did, which is why neither printed a summary in that run. Both were then run alone, above. |

The gate has **one** failure that survives isolation, `live-guard.test.ts`, and it is an
environment fact rather than a defect in the tree.
