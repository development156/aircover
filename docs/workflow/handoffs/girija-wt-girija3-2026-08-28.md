# Handoff — girija — wt-girija3 — 2026-08-28

**Branch** `claude/lead-research-kickoff-dw8slw` at `48a73e1d`. Lane `wt-girija3`.
Pushed: **yes**. PR
[#27](https://github.com/development156/sahodalabs/pull/27) → `wt-core`, draft,
and this session is subscribed to its activity.

The work is `0b3f9e5f`; `48a73e1d` merges `wt-core` in on top of it, taking the
three commits that landed there during this session so the lane is not handed
over without having seen the trunk. **The gate figures below are measured on
`0b3f9e5f`.** The merge touches only `.claude/`, `.githooks/` and `scripts/` —
no file under `apps/` or `packages/` — so the suite results stand, and
`prettier --check .` was re-run on the merged tree.

**The lane is `wt-girija3`; the branch is not.** The harness pinned this cloud
session to `claude/lead-research-kickoff-dw8slw` and it cannot leave, which is
why `sahoda.lane` still reads `wt-girija3` and this file carries that name. Same
call as 26 and 27 August.

**PR [#19](https://github.com/development156/sahodalabs/pull/19) MERGED** into
`wt-core` at 2026-08-27T16:51Z by IDIVASM. That closes the previous session's
work. This session's commit is fresh work on top of `wt-core`, not a
continuation of merged history: `0b3f9e5f` sits directly on `bf46eaa4`, which is
`origin/wt-core`.

---

## What shipped

One commit. It is a test-infrastructure fix, not a product change.

| # | What | Proof | Covered by |
|---|---|---|---|
| 1 | `export-drift.test.ts` skips when nothing ANSWERS at the database address, instead of when `SUPABASE_DB_URL` is merely unset | `0b3f9e5f`, `apps/web/src/lib/privacy/export-drift.test.ts:118` | itself — it skips here and stays red against a server that answers |
| 2 | `db-reachability.ts`, which draws the line between "could not ask" and "did not like the answer" and argues where | `0b3f9e5f`, `apps/web/src/lib/privacy/db-reachability.ts:82` | `apps/web/src/lib/privacy/db-reachability.test.ts` — 15 tests, four mutations |
| 3 | The header of `export-drift.test.ts` corrected: it claimed "the sandbox has no `.env`", which stopped being true on 2026-08-24 | `0b3f9e5f`, `export-drift.test.ts:13` | see "Anything retracted" |
| 4 | The turbo starvation that keeps the Stop hook red established as an environment fault, with the concurrency measurement that proves it | this file, `## Gate` | n/a — a measurement, not code |

### The defect, stated exactly

**MEASURED.** `export-drift.test.ts` chose `describe.skip` on
`process.env.SUPABASE_DB_URL === ''`, and its own header explained why: "the
sandbox has no `.env`". On **2026-08-24** `scripts/cloud-setup.sh` began writing
a real `.env` into the cloud sandbox — CLAUDE.md records that change. From that
date the variable is SET in an environment whose DNS cannot resolve the host it
names, so the file was red on **every** sandbox run:

```
Error: getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co
Test Files  1 failed | 452 passed | 2 skipped (455)
      Tests  2 failed | 5721 passed | 11 skipped (5734)
```

MEASURED by connecting `pg` to the configured URL directly: `code: 'ENOTFOUND'`,
`syscall: 'getaddrinfo'`, no `cause`, not an `AggregateError`.

**The skip condition never changed; the world it described did.** The comment
justifying it was still there, still persuasive, and by then false. That is the
lesson worth carrying: a skip condition is a claim about the environment and it
can rot silently while reading as deliberate.

### Why the fix is narrow, and what it deliberately will not excuse

The danger in this change is the change itself. A broader excuse would hide the
defect the file exists to catch — a table added to production and missing from
every export, while the export still says "everything you own".

So only a **socket-level failure**, and only **during connect**, counts:

| what happened | code | verdict |
| --- | --- | --- |
| the host does not resolve | `ENOTFOUND` | skip |
| DNS itself did not answer | `EAI_AGAIN` | skip |
| nothing listening on the port | `ECONNREFUSED` | skip |
| the attempt expired / no route | `ETIMEDOUT`, `EHOSTUNREACH`, `ENETUNREACH` | skip |
| wrong password | `28P01` | **RED** — a settings defect |
| permission denied on a catalog | `42501` | **RED** — a grant defect |
| the query returned the wrong tables | none | **RED** — the defect this file is for |

**`ECONNRESET` is excluded by name**, and that is the judgement call worth
challenging if anybody disagrees: a real production server that rejects a TLS
handshake resets the socket too, and excusing that would turn a broken
production connection into a silent skip.

The rule it encodes, which is not specific to Postgres: **a test may skip when it
could not ASK its question, never when it did not like the answer.**

### The skip is loud

MEASURED, `--reporter=verbose`:

```
↓ … knows about every workspace-owned table, and invents none
  [SUPABASE_DB_URL is set, but nothing answered:
   getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co (ENOTFOUND)]
```

It names the host and the syscall. "Database unavailable" sends somebody
hunting; this sends them to the fix.

---

## What was NOT done, and why

- **The pull request was late, not skipped.** The GitHub server was down at
  the moment the commit was pushed (`Dynamic Client Registration rejected (HTTP
  403)`) and there is no `gh` CLI here, so PR
  [#27](https://github.com/development156/sahodalabs/pull/27) was opened once it
  reconnected, at the end of the session rather than beside the push.
- **Nothing pushed to `wt-core`.** `/handoff` step 4 conditions that on the gate,
  and the gate has an UNRUN leg (`@smoke`) plus a leg that fails for an
  environment reason. The PR is the reviewable record.
- **The Playwright `@smoke` leg is UNRUN. Not passed — UNRUN.** Chromium cannot
  complete an outbound HTTPS request in this sandbox and every `@smoke` spec
  signs in through Clerk (REQUESTS §25). This diff touches no page, so it is not
  the leg that would judge it, but UNRUN is UNRUN.
- **The turbo starvation was measured here but NOT fixed here**, because no
  commit in this repository could reach the failing invocation: it lived in the
  Stop hook's command line, outside the repo. **Another lane fixed it during
  this session** — `414762d3`, merged in at `48a73e1d`. Detail in "What needs a
  decision", item 1, which is now answered rather than open.
- **`--concurrency` was NOT added to the root `pnpm gate` script.** It would not
  change the Stop hook's behaviour (the hook calls `turbo` directly, not
  `pnpm gate`), and it retimes the gate for all nine lanes, which is `wt-core`'s
  call rather than one lane's.
- **The end-to-end auth-failure case is covered at the classifier level only.**
  `28P01` is asserted in `db-reachability.test.ts`; proving it through a live
  Postgres would need a reachable server with a wrong password, and there is
  none here. What WAS proven end to end is the adjacent case: a listener that
  accepts and hangs up leaves the test red.
- **`ops/state/qa.pending.json` was reverted, not committed** — the right
  action, reached first for the wrong reason. It IS this session's file (I said
  otherwise and retract it below), but it is **scratch**: `.githooks/pre-commit`
  refuses any commit that stages it, because every gate run rewrites it and
  attributes the run to whichever card is open. Its own header records that on
  2026-08-25 a session committed it twice in three commits, once immediately
  after reverting it. The rule is "revert it, never commit it", and the tree is
  clean.

---

## Shared surfaces touched

**None.**

MEASURED, `git diff --stat bf46eaa4..0b3f9e5f`: 4 files. `LEARNINGS.md`, and
three under `apps/web/src/lib/privacy/` — one new module, one new test, one test
edited. No `packages/shared`, no `packages/db`, no migration, no token, no
fixture, no config, no `pricing.config.json`, no `.github`.

`db-reachability.ts` is a new module and therefore breaks no constructor: it has
no existing consumers, and its only importer is the test that came with it. It
exports `unreachableReason` and `UNREACHABLE_CODES`. Nothing else in the
repository imports either name.

**No product code changed.** Nothing a customer can see moved.

## Contract, migration or money

**None.** No contract, no migration, no ledger call, no price, no
`packages/shared`.

## Guards written, and the mutation that proved each

**15 tests in `db-reachability.test.ts`, and four mutations, each WATCHED going
red.** Half the tests assert what must NOT be excused; those are the ones worth
having.

| mutation | what went red |
| --- | --- |
| **A** — drop `'ENOTFOUND'` from `UNREACHABLE_CODES` | `excuses the failure that actually happens in the sandbox`, `follows a cause chain`, **and both `export-drift` tests return to exactly their original two failures** |
| **B** — add `'28P01'` to the set | `does NOT excuse a wrong password` |
| **C** — remove the cause-depth bound | `terminates on a cause that points at itself` — `RangeError: Maximum call stack size exceeded` |
| **D** — delete the `AggregateError` walk | `finds the code inside an AggregateError, where a dual-stack connect puts it` |

Mutation A is the load-bearing one: it proves the skip is caused by **this
classifier** and not by something incidental, because reverting the classifier
reproduces the exact original failure, by name.

**Two end-to-end proofs against real sockets**, because a unit test on an error
object cannot show what the driver actually throws:

| `SUPABASE_DB_URL` pointed at | result |
| --- | --- |
| a TCP listener that accepts and immediately hangs up | **RED** — `Error: Connection terminated unexpectedly` |
| a closed port, `127.0.0.1:55433` | **SKIP** — `nothing answered: connect ECONNREFUSED 127.0.0.1:55433 (ECONNREFUSED)` |

The first is the one that matters. It is a server that ANSWERED, and the test
stays red.

**What the guards assert, and what they deliberately do not.** They pin the
CLASSIFICATION (which codes are excused, which are not) and the SHAPES the
driver throws (`cause` chains, `AggregateError.errors`, a self-referential
cause, a non-object thrown). They do not pin the wording of the skip note beyond
requiring the host name and the code to appear in it, so the sentence stays
rewritable.

`it.each(UNREACHABLE_CODES)` enumerates the exported list rather than restating
it, which is why mutation A changed the test COUNT (16 → 15) as well as the
result. A restated list would have drifted from the real one silently.

## Anything retracted

**One, from the file's own header, and the measurement is what killed it.**

`export-drift.test.ts` said, as its justification for skipping on an unset URL:
"the sandbox has no `.env`". CLAUDE.md records the change that falsified it —
"**The cloud sandbox now GETS a `.env`**, written by `scripts/cloud-setup.sh` …
Changed 2026-08-24; this line previously said the sandbox has none by design."

MEASURED in this session: `env | grep -c SUPABASE_DB_URL` returns 1, and
`apps/web/.env.local` carries 46 lines. The claim was four days stale, and it
had been protecting a skip condition that no longer fired. The corrected header
states the date, the script, and what the condition is now, so nobody
re-derives it.

**Two, and the second one is mine, from this file, an hour after writing it.**

I recorded that `ops/state/qa.pending.json` was "not this session's file" and
left it uncommitted, citing `/handoff` step 4. **That was wrong, and the method
that produced it was wrong.** I read the diff with `grep`, saw zernio and
wt-divas text in the added lines, and concluded the records belonged to other
lanes. What I had actually found was a `—` → `—` re-encoding of OLD records,
which is what put other lanes' prose into the `+` side of a diff about my own
runs.

MEASURED properly, by comparing `client_id` sets between the working copy and
`HEAD` rather than reading the diff text: **59 records at `HEAD`, 62 in the
working tree, and all three new ones are this session's**, timestamped
`2026-08-28T06:57`, `07:05` and `18:02` — the turbo run where `apps/jobs` went
red, the second turbo run, and the final privacy-directory run. The last one
reads "The unit checks ran (56 passed), but 2 tests did NOT run — this does not
prove the suite passes", which is the QA logger correctly refusing to call my
new skip a pass.

**The lesson is the one this repository already has in a different costume:** a
diff shows you the lines that moved, not the records that changed, and a
reformatting commit makes those two things disagree completely. Comparing the
identifiers took one command and would have been right the first time.

**The action was right anyway, and that is the part worth not misreading.**
Having established the records were mine, I staged the file — and
`.githooks/pre-commit` refused the commit. The file is **scratch**: every gate
run rewrites it and attributes the run to whichever card is open, so committing
it puts one session's local run into everybody else's tree. The rule is "revert
it, never commit it", and the hook exists because on 2026-08-25 a session
committed it twice in three commits, once immediately after reverting it for
this exact reason. So a wrong premise and a correct rule pointed at the same
outcome, which is exactly the situation in which nobody notices the premise was
wrong. It is reverted; the tree is clean.

**Nothing else was retracted.** The 26 and 27 August files stand unaltered.

## What the next session in THIS lane should pick up

1. **Drive PR [#27](https://github.com/development156/sahodalabs/pull/27) to
   green and get it merged.** It is open, draft, into `wt-core`, and it is the
   only thing this lane has outstanding.
2. **Do not treat a red `turbo run test` at default concurrency as a defect
   without checking WHICH file failed.** It has named a different innocent file
   on each of two consecutive runs. Run the suspect package alone first; if it
   is green in isolation, it is the starvation and not your diff. The decision
   below is the real fix.
3. The `@smoke` leg remains **UNRUN** on this lane, and the `smoke` job on
   `.github/workflows/gate.yml` dispatched by hand is where it runs.
4. Everything else owed is listed in `girija-wt-girija3-2026-08-26.md` and none
   of it moved: no credit figure on the re-resolve buttons, the design-lint
   baseline untightened, `@sahoda/db` skipping 12 of 46 test files.

## Gate

Run on `0b3f9e5f`. **Not piped** — each exit code read directly.

| leg | result |
| --- | --- |
| `prettier --check .` (root, unpiped) | **PASS** — exit 0, "All matched files use Prettier code style!" |
| `tsc --noEmit` (apps/web) | **PASS** — exit 0 |
| `pnpm lint` (apps/web) | **PASS** — 1375 files scanned, every ratchet at baseline, none new |
| `pnpm run test` (apps/web, alone) | **PASS** — 454 files passed, 2 skipped; **5736 passed, 0 failed, 13 skipped** |
| `pnpm run test` (apps/jobs, alone) | **PASS** — 34 files, 396 tests, 0 failed |
| `turbo run test --filter="...[origin/main]" --force`, default concurrency | **FAIL — environment, not this diff.** See below |
| the same leg, `--concurrency=2` | **PASS** — exit 0, zero failures |
| `playwright --grep @smoke` | **UNRUN, not passed** |

**No leg was a cache replay.** Every turbo run carried `--force`; the two package
suites were run directly through vitest.

### The turbo failure, grouped by cause rather than counted

Three consecutive full runs of the same leg on the same commit:

| run | concurrency | result | what failed |
| --- | --- | --- | --- |
| 1 | default (8 packages at once) | RED | `apps/jobs` — `backfill/store.pglite`, `reconcile/store.pglite` |
| 2 | default | RED | `apps/web` — `workspace-timezone.pglite`, `asset-library` Undo; `Hook timed out in 10000ms` |
| 3 | `--concurrency=2` | **GREEN**, exit 0 | nothing |

**A different package and different files each run, every one green in
isolation.** The two files run 1 named pass together in 37 seconds on their own.
`nproc` is **4**; turbo runs 8 package test tasks concurrently and each spawns
its own vitest workers, so the box is oversubscribed several-fold and whichever
suite is booting an in-process Postgres when the crunch arrives loses the race.

This is not a new discovery — `wt-core` diagnosed it on 2026-08-27 and wrote the
argument into `apps/web/vitest.config.ts:27`: "that is not four flaky tests, it
is one starved machine". It capped **that package** to 4 workers. The cap cannot
see the other seven packages, which is why it did not hold here. Only
`apps/web` and `packages/db` cap workers at all.

**INFERRED, not measured:** that a single `--concurrency=2` pass is proof rather
than luck. It is one observation against two failures. The mechanism is measured;
the sufficiency of that exact number is not.

## What needs a decision

1. ~~Whether the Stop hook's turbo invocation gets `--concurrency=2`.~~
   **ANSWERED, and not by this lane.** `414762d3` on `wt-core`, "the Stop hook
   was manufacturing the failures it reported", landed while this handoff was
   being written and was merged in at `48a73e1d`. `scripts/stop-gate.sh:96`
   passes `--concurrency=2` for the reason measured here — its own header says
   "Turbo's default fans out across packages and each package's runner fans out
   again, which is how one gate saturates twelve cores by itself" — and adds
   three things this lane did not think of: a machine-wide lock so two
   worktrees cannot gate at once, a skip when nothing changed, and **a red run
   re-run SERIALLY, so only a failure that survives both is reported.**
   Two lanes reached the same diagnosis independently from different symptoms,
   which is the strongest form the evidence could have taken. Nothing is owed
   here.
2. **`08_ROLES.md` says girija is design and jiban is research**, while the
   arguments to `/kickoff` said `/lead-research`. Raised by `wt-girija2` on
   26 August, restated on 27 August, still unruled. The arguments win per
   `/kickoff`, so no work was blocked by it.
