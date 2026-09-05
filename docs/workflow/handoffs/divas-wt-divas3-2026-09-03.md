# Handoff — divas — wt-divas3 — 2026-09-03

**Branch** `wt-divas3` at `46b5ffa0`. Lane `wt-divas3`. Pushed: **yes**
(`3a89e60f..46b5ffa0`). Level with `origin/wt-core` before this work began.

> The task was the QA sweep artifact, "start and fix everything". The sweep
> reported 113 findings with 3 blockers and 27 of 30 highs fixed, and said
> "nothing has been pushed". **That is now false in the sweep's favour**: its
> 16 commits (`2dba741c..cd8ff8c7`) ARE on the trunk. MEASURED,
> `git merge-base --is-ancestor cd8ff8c7 origin/wt-core` succeeds.

---

## The one thing that has not moved, and cannot be fixed from here

**The published database credential is still live in 8 commits across 16
branches, and three branch TIPS still carry it — including `origin/wt-web`,
which is production.**

MEASURED this session, by scanning every commit that ever touched
`ops/state/qa.pending.json` for a connection string with a password:

| Fact | Value |
| --- | --- |
| Commits in reachable history still carrying it | **8** |
| Branches reachable from those commits | **16** |
| Branch TIPS whose current file still carries it | **3** — `origin/wt-web`, `origin/wt-drop-karunesh-posts`, `origin/claude/advisor-qvz5wn` |
| How far behind production is | **173 commits**, last updated 2026-08-31 |

The sweep's fix landed on `wt-core` and never propagated. **Nothing in any
branch closes this — only rotating the password does**, and history rewriting
plus any push to `wt-web` are both forbidden here.

**Both walls the sweep built DO work, verified by mutation rather than read:**

- `redactSecrets` strips all six credential shapes (postgres URL, Bearer, JWT,
  vendor key, JSON password, query parameter). Tested with fabricated values;
  **all six redacted, none leaked.**
- `.githooks/pre-commit` refuses a planted credential with **exit 1** and the
  sentence "There is no hatch for this", and passes the clean file with exit 0.
  Probe reverted, tree clean.

So the leak cannot recur. The leaked value is still valid until someone rotates it.

---

## What shipped

| # | What | Proof | Covered by |
| --- | --- | --- | --- |
| 1 | **A viewer could approve a post for publishing** | `planner.ts:42`, `approvals.ts:70` | `planner.test.ts` (10), `approvals.test.ts` (6, NEW file) |
| 2 | A Retry button on a duplicate post that could never work | `publish-error-copy.ts:90` | `publish-error-copy.test.ts` (10) |
| 3 | Four more publish codes with no customer copy | same file, lines 55/70/95/110 | same |
| 4 | The copy sweep could not see the adapter at all | `publish-error-copy.test.ts`, second extractor | same |
| 5 | Onboarding PDF door promised 6 MB; platform allows ~4.5 | `door.ts:73` | `door-request.test.ts` (9) |
| 6 | A measured model-tier decision that never took effect | `routing.ts:61` | `routing.test.ts` (14) |

### 1 — the permission boundary, which is the most serious

`approvePost` and the bulk `approvePosts` read **no role**, and RLS does not
close it: `posts` carries `app.apply_tenant_policies`, which grants full CRUD to
every member regardless of role (`20260718000001_helpers.sql:34`). The workspace
has a dedicated `approver` role that meant nothing, and `viewer` — the role that
exists to read — could move a post into the state publishing sends from. The
button was shown to them too.

Both actions now read the role **before** the update, with **two different
sentences**, because "you may not" and "we could not confirm your role" are
different claims: one says ask for access, the other says try again.

### 6 — the decision nobody took

A bake-off on 2026-08-12 chose haiku-4.5 for `brand_guidelines` over sonnet-5:
the same four specific red lines at **5.7× less cost and 2.6× less latency**. The
conclusion was written into `TASK_TIER` — **a table read by nothing at runtime**.
`MeshTaskDef.tier` is the source, and `tasks/brand-guidelines.ts` has said
`standard` since the file was created (`git log -L48,48` shows one commit, the
creating one). So the saving was never taken, and a test pinned the dead value
for three weeks while the guide, the table and the runtime disagreed three ways.

The table now matches what runs. **No route changed and no customer sees anything
different** — applying the bake-off is a decision, not a cleanup, and its own
caveat (haiku returned `signal_lock: 'strong'` on all three runs) was never
discharged.

---

## What was NOT done, and why

- **The Playwright suite is UNRUN, not passed.** Unchanged from this lane's
  previous sessions: the sandbox cannot drive it, and the runner exits at its
  guard because three repository secrets do not exist.
- **The approve button is still shown to a viewer.** The server refuses them, so
  the boundary holds, but the UI does not know. Threading the role into
  `approve-button.tsx` means changing the planner page, the list and the
  component — a UI change I could not verify in a browser, in a lane where the
  browser leg does not run. Deliberately left.
- **No migration was written or applied.** Two findings need one and both belong
  to `wt-db`: a role-aware RLS policy on `posts` (the durable half of finding 1),
  and `competitor_sources.last_attempted_at` for Radar starvation.
- **Radar starvation, Zernio reconnect CTA, and the jobs vitest config were
  investigated and NOT fixed.** Findings below; two need a migration or a
  decision, one is not reproducible.
- **51 low-severity findings from the sweep remain unverified**, as the sweep
  itself recorded. I did not widen into them.
- **I did not touch `wt-web` or promote anything.**

---

## Shared surfaces touched

| Surface | Change | Shape |
| --- | --- | --- |
| `apps/web/src/lib/workspace-role.ts` | `canApproveAsRole` + two sentence constants | **Additive.** `canPublish` and `getWorkspaceRole` unchanged |
| `apps/web/src/lib/posts/publish-error-copy.ts` | 5 entries added | **Additive.** No existing entry changed |
| `apps/web/src/lib/onboarding/read-door.ts` | `PDF_TOO_LARGE_MESSAGE` now exported | **Additive**, so a test can assert the sentence |
| `apps/web/src/lib/onboarding/door.ts` | `MAX_PDF_BYTES` 6,000,000 → **4,000,000** | **A REAL LIMIT DROP.** Anything reading this constant now refuses a smaller file — which is what the platform was already doing silently |
| `packages/mesh/src/routing.ts` | `TASK_TIER.brand_guidelines` economy → standard | **No runtime effect** — that table routes nothing |

**None of these is a required-field change**, so nothing breaks a constructor.

## Contract, migration or money

**No migration written, none applied. `packages/shared` untouched.
`pricing.config.json` untouched. No ledger path touched.** MEASURED.

The credit-grant blocker (erase workspace, create workspace, get another 100
credits) is **already fixed in code** by
`20260902220003_signup_grant_per_user.sql` and **is not applied to production**.
Its guard was mutation-proven this session by a subagent against PGlite: with the
fix, one grant; with the original function restored, two grants and a 100-credit
balance on the second workspace.

## Guards written, and the mutation that proved each

**Four, each broken and watched go red, then restored.**

| Guard | The mutation | What went red |
| --- | --- | --- |
| `TASK_TIER` agrees with every task definition | set `plan-week.ts` tier to `premium` | `TASK_TIER says 'standard' for plan_week; the task definition … says 'premium'` |
| approve role gate, single | moved the gate BELOW the update | `expected { status: 'approved' } to be null` — the row was written and the sentence was still right |
| approve role gate, bulk | same move | same, both refusal tests |
| PDF door under the platform cap | restored `MAX_PDF_BYTES = 6_000_000` | `expected 6071584 to be less than or equal to 4500000` and `expected 'over 6MB' to contain 'over 4MB'` |
| publish copy sweep | deleted the `ALREADY_POSTED` entry | `expected [ 'ALREADY_POSTED' ] to deeply equal []` |

The two approve mutations are the ones worth keeping: **a test asserting only the
message would have passed both.** That is why they assert the write.

## Anything retracted

**1 · My first extractor regex was wrong, and the test caught it.** I anchored the
positional-code sweep on `fail(\s*[^,]+,\s*'CODE'`. Customer sentences contain
commas, so it stopped inside "…last 24 hours, so this one was not sent again" and
**missed the very code the test was added for**. Found on the first run, not by
reading. Re-anchored on the classification literal that always follows the code.

**2 · Three of the five missing copy entries were found by the new guard, not by
the sweep or by me.** `CHANNEL_MISMATCH`, `INVALID_ACCOUNT_ID` and `NO_POST_ID`
were not in the artifact. The report named two; the sweep found five.

**3 · Three findings I was asked to fix were already fixed**, a day before the
artifact was read: the 12 MB body ceiling (`4788c808`), the Radar NULL ordering
(`4004928a`), and the Loop's four-channel lists (`5abc87c7`). I checked before
editing rather than after.

## What the next session in THIS lane should pick up

1. **Rotate the production database password.** Still the first thing, still
   nothing in code can do it, and the exposure is now measured precisely: 8
   commits, 16 branches, 3 tips, production among them.
2. **`origin/wt-web` is 173 commits behind and its current `qa.pending.json`
   still carries the credential.** Promoting `wt-core` would fix the file as a
   side effect. It does not fix the leak.
3. **Apply `20260902220003_signup_grant_per_user.sql`**, or confirm it is
   applied. Until then the free-credits loop is open against the live product
   even though the code closes it.
4. **The erase screen now lies by omission.** `your-data-panel.tsx:343,370` tells
   the customer their credit record is kept and never says the next workspace
   starts at zero rather than 100. Harmless while the loop paid out; a real
   surprise once the guard is live.
5. **Radar starvation has a new cause.** `radar_begin_fetch` writes no log row on
   `DAILY_CAP` or `WORKSPACE_CAP`, and two refusal paths in `run.ts` (`:336`,
   `:479`) skip `recordAttempt`. A sole-subscriber workspace at its cap starves
   the weekly batch exactly as before. The durable fix is a
   `competitor_sources.last_attempted_at` column — **wt-db only**.
6. **No failed publish row anywhere offers a reconnect link.** `needsReconnect`
   is set on several entries and has **zero consumers** — grep finds none. The
   flag is honest and nothing reads it.
7. **The jobs red leg is not reproducible.** Four green runs, including under
   deliberate contention and under `turbo run test`. `apps/jobs` lacks
   `fileParallelism: false` that `packages/db` has, but nothing measured needs
   it. Do not add it without failing output on a named commit.
8. **`ops/state/qa.pending.json` reset itself to empty again this session** and
   was reverted, as the standing rule requires. That rule has now held for two
   opposite symptoms.

## Gate

| Leg | Result | Real output |
| --- | --- | --- |
| `turbo run typecheck lint test --force` | **PASS** | `27 successful, 27 total`, `0 cached`, **5m49.681s** |
| `@sahoda/web` vitest | **PASS** | `631 passed \| 3 skipped (634)`; `8158 passed \| 13 skipped (8171)` |
| `prettier --check .` | **PASS** | `All matched files use Prettier code style!` |
| `packages/mesh` routing | **PASS** | 14 passed |
| `apps/web` onboarding | **PASS** | 21 files, 312 passed |
| `redactSecrets`, six shapes | **PASS**, mutation-proven | all six redacted, fabricated values, none leaked |
| `.githooks/pre-commit` credential wall | **PASS**, mutation-proven | refuses planted credential exit 1; clean file exit 0 |
| Playwright `@smoke` | **UNRUN, not passed** | sandbox cannot drive it; runner exits at its guard, three secrets absent |
| `@sahoda/db` against the live database | **UNRUN** | Supabase MCP failed to connect all session |

**8,158 passing in `apps/web`, against the sweep's 8,049** — the difference is
this session's 16 new tests plus what the trunk gained.
