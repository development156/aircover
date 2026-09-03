# Handoff — karunesh — wt-karunesh2 — 2026-09-03

**Branch** `wt-karunesh2` at `0fc0352f`. Lane `wt-karunesh2`. Pushed: **yes**,
level with `origin/wt-karunesh2`.

**This lane's work is MERGED.**
[development156/aircover#33](https://github.com/development156/aircover/pull/33)
merged into `wt-core` on 2026-08-31 at 12:40 UTC. MEASURED:
`git merge-base --is-ancestor 0fc0352f origin/wt-core` returns true, and this
branch holds **0 commits** `origin/wt-core` does not.

This is the closing record for the lane. The working session is
`karunesh-wt-karunesh2-2026-08-31.md`, which carries the full detail; this file
says what happened after it was written and what state the lane is in now.

---

## What shipped

Nothing new since the previous handoff. Everything below was already committed
and is now on `wt-core`.

| Item | Proof | Covered by |
| --- | --- | --- |
| Analytics rebuilt as the evidence layer | `6a4fda80` | `components/analytics/rebuilt.test.tsx` (15), `lib/analytics/{timing,view-params,rows,headline}.test.ts` (65) |
| The weekly narrative arithmetic that became its foundation | `873da5de` | `lib/analytics/{grouped-lift,like-age,week-report}.test.ts` (55) |
| The shared timing selector both screens read | `lib/analytics/timing.ts:180` `timingGrid`, `:245` `bestSlotSentence` | `timing.test.ts` (18) |
| The sandbox smoke-blocker diagnosis and its retraction | `0fc0352f` | prose, not code; seven measurements recorded in the 31 August handoff |

---

## What was NOT done, and why

- **Playwright `@smoke` was never run as a suite, on any commit of this lane.**
  UNRUN, not passed. The reason is measured and recorded below.
- **This lane was not promoted to `wt-web`.** `wt-core` reaching production is
  the one gated step in this system and it is not a lane's call.
- **The sandbox blocker was diagnosed, not fixed.** The fix lives in `scripts/`,
  `playwright.config.ts` or the environment, none of which is this lane's file.
  Three options are set out in the 31 August handoff, uncosted on purpose.
- **The two product decisions were never answered.** They were put to the
  founder on 29 August, restated on 31 August, and are restated once more below.
  They are now questions about `wt-core`, not about this lane.
- **Nothing was re-verified today.** The tree has not changed since `0fc0352f`
  and CI passed on that exact SHA, so a re-run would have measured nothing. I am
  citing that run rather than claiming a fresh one.

---

## Shared surfaces touched

**None since the previous handoff.** Nothing was edited in this session.

For whoever integrates further work on top, the surfaces this lane introduced
and that are now shared on `wt-core`:

| Surface | Who else consumes it | Breaking? |
| --- | --- | --- |
| `lib/analytics/timing.ts` | `/analytics` and `/report` both | No. New file. It exists so the two screens cannot name different best slots |
| `lib/analytics/grouped-lift.ts` | `lib/loop/reflect.ts`, which now delegates to it | No signature change. One real behaviour change: a deterministic tie-break replaces row order |
| `lib/loop/iso-week.ts` | existing callers | **Additive only** — `isoWeekStart` added, nothing removed, so no existing caller breaks |

---

## Contract, migration or money

**None.** No change to `packages/shared`, no migration, no price, no ledger
call, across either commit.

---

## Guards written, and the mutation that proved each

**None this session.** The 95 tests behind the two merged commits were each
mutation-proved when they were written; the table of which mutation turned which
test red is in PR #33's body and in the 31 August handoff.

---

## Anything retracted

**Two, both mine, both from this session's own reports.**

1. **I said the ops queue file was being "wiped" and suggested somebody look
   into why.** Wrong, and it would have sent a person after a defect that does
   not exist. MEASURED from `scripts/lib/ops-queue.mjs:31`: that file is an
   OUTBOX, and its own code says a healthy queue is empty seconds after anything
   enters it. The session-start sync had delivered the rows and emptied it, which
   is the sync working. It differs from git only because git holds rows already
   sent.

2. **The 31 August handoff's central retraction stands and is worth repeating
   here**, because it overturns three days of shared belief: the smoke suite's
   `ERR_CONNECTION_RESET` on `http://127.0.0.1:3100` is NOT a loopback failure.
   Clerk's middleware answers document requests with a 307 out to its own HTTPS
   host; the browser follows it; and this sandbox resets every outbound HTTPS
   request the browser makes. MEASURED seven ways, including Chromium loading a
   bare loopback server at 200 in the same run, and `https://example.com/`
   resetting identically. The failure is on the second request and Playwright
   prints the first one's address.

**Still not known, and not claimed:** why Chromium's outbound HTTPS is reset
when Node's is not. Node reached Clerk's API at 200 in the same session.

---

## What the next session in THIS lane should pick up

**Nothing is in flight. Start from `origin/wt-core`, not from this branch** —
`wt-core` is 279 commits ahead of it.

Three things are queued, in the order I would take them:

1. **The two open decisions**, both now about code sitting on `wt-core`:
   - `week-card.tsx`, `week-copy.ts` and `week-data.ts` are rendered by nothing.
     Do they move to `/report`, or come out?
   - Which of five Analytics extras is first: CSV export, post thumbnails, a
     custom date-picker UI, a multi-brand switcher, a plain-English trend
     sentence under the chart. A sixth, filtering by editorial format, is
     BLOCKED — no such classification exists in the data.
2. **`sandbox-probe.mjs` reports "the suite CAN run here" off a check that
   cannot see the failure.** It binds its own listener and navigates to that,
   never touching the app. Under this project's one rule that is the defect, and
   it has now produced a wrong diagnosis in two separate lanes.
3. **The Stop hook reports a dirty repository on every session**, always for
   `ops/state/qa.pending.json`, which a formatter rewrites after every tool call
   and which the pre-commit hook forbids committing. Two automations in
   deadlock. The fix is for the hook to skip `ops/state/*.pending.json`. I did
   not make it: `.claude/` is outside this lane.

---

## Gate

| Leg | Result |
| --- | --- |
| `typecheck · lint · test · format` (CI, on `0fc0352f`) | **PASS** — success, 8m16s, 2026-08-31 09:07 UTC |
| `turbo typecheck lint test --force`, 27 tasks (on `6a4fda80`) | **PASS**, forced, not a cache replay |
| `@sahoda/web` unit, 6,358 tests (on `6a4fda80`) | **PASS**, 13 skipped |
| `prettier --check .` | **PASS**, clean repo-wide |
| Design lint | **PASS**, no raw hex, no off-scale type |
| Playwright `@smoke`, full suite | **UNRUN**, on every commit of this lane |
| Playwright `e2e/unauthenticated.spec.ts` (5 tests, 2026-08-31) | **FAIL**, 5 for 5, one message, environment not diff |
| Clerk `global-setup` | **PASS** — `pk_test_` key, `clerkSetup()` completed with no throw |
| Nothing re-run 2026-09-03 | tree unchanged since `0fc0352f` |

**Working tree.** One file modified and it is not mine:
`ops/state/qa.pending.json`, left uncommitted deliberately, for the reason in
"Anything retracted".

**Preview.** https://sahodalabs-git-wt-karunesh2-development-4417s-projects.vercel.app/analytics —
built and confirmed ready. **This is not what customers see.**
https://app.sahodalabs.com/analytics does not carry the change and will not until
somebody promotes `wt-core` to `wt-web`.
