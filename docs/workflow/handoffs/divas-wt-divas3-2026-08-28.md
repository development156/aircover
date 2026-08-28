# Handoff — divas — wt-divas3 — 2026-08-28

**Branch** `claude/divas-kickoff-xdoxoa` at `4fd5ab18`. Lane `wt-divas3`. Pushed: yes.
PR [#26](https://github.com/development156/sahodalabs/pull/26) → `wt-core`, draft, open.
PR [#18](https://github.com/development156/sahodalabs/pull/18) → `wt-core` is **MERGED**,
2026-08-27T16:51:52Z, by IDIVASM, at `41e32276` into base `1bb51630`.

> This is a `/kickoff` session followed by `/handoff`. **No product work was
> asked for and none was done.** The value here is four facts about the state of
> this lane that the next session would otherwise have to rediscover, and one
> retraction of my own.

## What shipped

**Nothing. No code was written and no commit was made before this one.** MEASURED:
`git status --short` was empty at session start and again at the end; the only
commit reachable from `HEAD` that is not on `origin/wt-core` is `15de9f3b`, the
previous session's own handoff.

## What was NOT done, and why

- **Nothing, once PR #26 was opened.** `lane-sync pull` and `push` both STOPPED
  on `ops/state/qa.pending.json` during the handoff itself and I left them
  stopped, as `/kickoff` requires. **That is superseded**: opening the PR made
  the conflict this branch's own to resolve, and `4fd5ab18` merges `wt-core`
  `127b29c4` in. The lane has now seen the trunk.
- **The whole gate, except formatting.** No code changed, so the code tree at
  `15de9f3b` is byte-identical to `41e32276` — MEASURED, `git diff 41e32276
  15de9f3b` is two files, `divas-wt-divas3-2026-08-27.md` (+135) and
  `ops/state/qa.pending.json` (+16/-1), and neither is code. Re-running vitest
  here would measure a 121-commit-stale tree that nobody will merge. See Gate.
- **`@sahoda/db` could not have run honestly anyway.** Session 2 MEASURED
  `getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co` from this sandbox.
- **Playwright: UNRUN, never passed.** Probe verdict below.
- **I did not resolve the merged-PR question.** See the last section — it needs a
  decision, not a guess.

## Shared surfaces touched

**None.** MEASURED: the only file this session writes is this one.

For the next session's benefit, the shared surfaces that moved **under** this
lane, MEASURED as `git diff --stat HEAD...origin/wt-divas3` restricted to
`packages/shared` and `packages/db/supabase/migrations`:

| Surface | Change | Shape |
| --- | --- | --- |
| `packages/shared/src/publishing/constraints.ts` | +186 | **keywords replace hashtags**, flagged `[contract]` in `4525a3ab` |
| `packages/shared/src/enums.ts` | +131 | additive |
| `packages/shared/src/brain/observations.ts` | +138 | three new observation kinds |
| `packages/shared/src/mesh/tasks.ts` | +45 | additive |
| `packages/shared/src/db/identity.ts` | +24 | additive |
| `packages/shared/tokens.css` | +61 | **regenerate the inline copy** after pulling: `node scripts/gen-tokens-inline.mjs` |
| `packages/db/supabase/migrations` | **7 new** | widened channels, widened connection platforms, workspace timezone and intake, three observation kinds, profile-cleared-on-erase |

## Contract, migration or money

**None by this session.** MEASURED: `packages/shared` untouched,
`packages/db/supabase/migrations` untouched, `pricing.config.json` untouched, no
ledger path touched, no migration applied to any database.

## Guards written, and the mutation that proved each

**None written, so none proved.** No guard was needed and I will not claim a
mutation I did not watch go red.

## Anything retracted

**1 · I reported `NO_BROWSER` in the kickoff report before I had run the probe.**
The verdict happens to be right — I ran `node scripts/sandbox-probe.mjs`
afterwards and it printed `Verdict: NO_BROWSER`, `https from Node — 200`,
`browser binary NOT installed`. **But it was labelled MEASURED when it was
inferred**, and a correct answer reached the wrong way is the exact failure this
repository keeps paying for. Recorded because the label is the thing that has
value, not the verdict.

**2 · Session 1's claim that `ops/state/qa.pending.json` is "deliberately not
committed, fifth session running" did not hold for Session 2.** MEASURED: `git
diff 41e32276 15de9f3b -- ops/state/qa.pending.json` shows `"runs": []` becoming
a one-element array holding the `asset-library.test.tsx:233` failure record,
committed inside `15de9f3b`. **That committed row is the near side of the
conflict `lane-sync` just stopped on** — `wt-core` carries 770 lines of run log
in the same array. The advice was right; the session that wrote it did the
opposite in the same commit.

**3 · My first resolution of `ops/state/qa.pending.json` was partly a rewrite,
not a merge.** Rebuilding the file with `json.dump(..., ensure_ascii=False)`
unescaped the `\u2014` sequences in 59 rows I did not author, and sorting by
`(started_at, client_id)` tie-broke two rows sharing a timestamp into the
opposite order from the trunk's. MEASURED: that produced a **+123/-55** diff
where the honest one is **+13/-0**. Caught by reading the diff rather than the
exit code, and redone as an insertion into the trunk's own list after proving
`json.dumps(indent=2, ensure_ascii=True)` reproduces `wt-core`'s file byte for
byte. **A conflict resolution that changes lines neither side changed is not a
resolution.**

## What the next session in THIS lane should pick up

1. **Settle where this lane's work continues, before writing any of it.** PR #18
   is merged, so this branch cannot carry new work under it. The harness rule
   says restart the branch from the default branch; this project says never cut
   from `main`. `origin/wt-core` at `127b29c4` is the reconciling base and it is
   **green today** — gate run 609, `success`, 2026-08-28 09:38:56→09:48:33Z.
2. **`ops/state/qa.pending.json` is DONE, as a union.** `4fd5ab18`, +13/-0,
   60 runs = the trunk's 59 plus this branch's 1. Nothing of the trunk's bytes
   moved. Do not redo it; the retraction above says why the first attempt did.
3. **The Session 2 handoff exists on this branch alone.** MEASURED: `git branch
   -r --contains 15de9f3b` names only `origin/claude/divas-kickoff-xdoxoa`, and
   the copies of `divas-wt-divas3-2026-08-27.md` on both `origin/wt-divas3` and
   `origin/wt-core` have no `# Session 2` heading. Carry that section across, or
   the record of the untested merge commit is lost at the next fan-in.
4. **The browser gap may already be closed on the trunk.** `wt-core`'s head
   commit is `fix(sandbox): the cloud lanes had no browser, because nothing ever
   installed one` — `cloud-setup.sh` now installs chromium, the probe self-heals
   by installing when the binary is absent, and `browser-run.mjs` runs on
   `LOCAL_ONLY`. **The probe I ran is the pre-fix one, 121 commits old.** So
   `NO_BROWSER` is this checkout's verdict, and INFERRED, not measured, that the
   post-merge probe would go further. Pull the trunk, then re-probe, then run the
   drags and the arrow keys that this lane has never driven with a real pointer.
5. **Session 2's one owed item is already paid, by someone else.** It asked for a
   look at the load-sensitive `asset-library.test.tsx:233` `waitFor`.
   `a964402e` on `wt-divas3`, "the assets Undo guard lost a race under full-suite
   load", is that fix. Do not redo it; verify it survived the fan-in.
6. **`workspace-timezone.pglite.test.ts` has two `beforeAll` hooks and only one
   has a budget.** Both call `bootFullSchema()`; line 40 carries `60_000` from
   `eb5224bf`, line 113 carries vitest's 10s default. MEASURED both halves: the
   file passes alone in 8.08s, and that second hook times out at 10s under
   full-suite load on this 4-core box (`vitest.config.ts:53` sets
   `maxWorkers: 4`, load average 5.51 during the run). **One line, `}, 60_000)`,
   nothing weakened.** Not pushed from here: this branch's PR is docs-only and
   the file is not in its diff. Raised on PR #26 with the patch.
7. **CI is intermittently allocating no runner, and it is not any one branch.**
   MEASURED: eight `gate.yml` runs across five branches inside four minutes, all
   3 to 11 seconds, `runner_id: 0` on this one. A real run takes about eleven
   minutes. **Not the 26 August total outage** — run 609 on `wt-core` got a real
   runner this morning and went green in 11m 19s. No re-run has been spent.
8. **Never `git add -A`, and here is why this one file keeps conflicting.** The
   QA hook does not merely append a row to `ops/state/qa.pending.json` — **it
   rewrites the whole file unescaped.** MEASURED at the end of this session,
   after my own gate run: the working copy differs from `HEAD` by **+45/-32**,
   of which exactly ONE line is the new record (`qa-mtd9ppcu-7d7b1f34`) and the
   rest is `\u2014`, `\u23af` and `\u00d7` unescaping across 60 rows nobody
   touched. The committed file holds **0** non-ASCII characters; the hook's
   output holds **306**. So every session that commits this file offers a diff
   that looks like sixty changed records and is one, and two such sessions
   conflict on rows neither of them wrote. That is the mechanism behind five
   sessions of "reverted rather than committed", and behind this session's own
   conflict. **Revert it; never commit it.** I reverted it.
   `core.hooksPath` is unset, so `.githooks/pre-commit` is disarmed and nothing
   but attention enforces this.

## Gate

| Leg | Result | Real output |
| --- | --- | --- |
| `node scripts/sandbox-probe.mjs` | **NO_BROWSER** | `yes https from Node — 200`; `NO browser binary NOT installed`; exit 0 |
| `prettier --check .` (root, repo's pinned binary) | **PASS** | see below |
| `turbo run typecheck lint test --force`, on the MERGED tree `4fd5ab18` | **1 failure** | `25 successful, 27 total`, `0 cached`, 5m30.656s. `@sahoda/db#test` was cancelled by that failure, not failed |
| ↳ `@sahoda/web` tests | **0 tests failed** | `5712 passed \| 22 skipped`. `1 failed` **test file**, which died in its `beforeAll`: `workspace-timezone.pglite.test.ts`, `Hook timed out in 10000ms`. Pre-existing on the trunk; see item 6 above |
| ↳ that file alone, immediately after | **PASS** | `1 passed (1)`, `15 passed (15)`, 8.08s |
| CI `typecheck · lint · test · format` on `a7f32615` | **RAN NOTHING** | job 98937613996, `runner_id: 0`, `runner_name: ""`, 18:00:26Z→18:00:27Z. One second, zero steps |
| Playwright `test:smoke` | **UNRUN, not passed** | no browser binary; and `apps/web/.env.local` is absent, so `e2e/global-setup.ts` throws on the missing Clerk names before any spec loads |
| `lane-sync pull` and `push` | **STOPPED, both** | 1 conflict, `ops/state/qa.pending.json`. Superseded by `4fd5ab18`, which resolves it |

**Read the one failure for what it is: zero tests failed.** A file that dies in
its `beforeAll` reports as a failed FILE with none of its tests attempted, which
is the raised-skip-count signature `eb5224bf` records. It is not this PR's
either way: the whole diff is two markdown files and one JSON log row, none of
which can affect a PGlite boot.

**The trunk's own gate is the last authoritative green.** MEASURED: run 609 on
`wt-core` `127b29c4`, `conclusion: success`, 2026-08-28 09:38:56→09:48:33Z. This
branch now carries that commit, and CI has not been able to say anything about
the merge because no runner has been allocated to it.
