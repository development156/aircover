# 16 — Roadmap and Board Update

**Written:** 31 July 2026
**Amends:** `15_Beta_Launch_Plan_SAHODA_LABS.md` §4, §12 and §14. Doc 15
otherwise stands.
**Companion:** `13_Zernio_Integration_SAHODA_LABS.md`, unchanged.
**Board:** 49 cards today → **58** once §4 is applied.

This document exists because the world moved between doc 15 being written and
today, and because nine defects found since then have no cards. It is both a
readable roadmap and the source text for the board update in §4.

---

## 0. Status at time of writing

| | |
|---|---|
| **Production** | **DOWN** since 30 July ~19:29 IST. Every route on every domain returns `text/plain` `DEPLOYMENT_NOT_FOUND` |
| Trunk | `wt-web` @ `8f9a0db`, pushed, local and origin identical |
| Repository | `development156/sahodalabs` — **public**, default branch now `wt-web`, 0 forks, 0 stars |
| Vercel project | `prj_L4IDks4bMlBwObyKcHzej6lVqm9D` — builds `main`, three deployments, all `ERROR` |
| Database | **Intact.** Supabase is a separate service; nothing touched it |
| Users | 26 workspaces, 17 people, currently with no application to reach |
| Secrets | Clean. No credential has ever been committed on any ref |

---

## 1. The 30 July infrastructure incident

Recorded here because it is the reason the roadmap moved, and because the rule
it produces matters more than the outage.

### Timeline

| Time (IST) | Event |
|---|---|
| 17:00 | `8f9a0db` — board reconciliation committed |
| 19:01 | **New GitHub repository created** (public) |
| 19:25 | Branches pushed to the new remote |
| 19:29 | **New Vercel project created** |
| — | The old repository and the old Vercel project were destroyed in this window, taking deployment `dpl_8te1K3q…` (`ef50fb6`) with them |

### Root cause of the outage

The new Vercel project builds `main`. On the new remote, `main` is a **single
"Initial commit" holding 490 files — roughly half the codebase** — and predates
commit `ba32a3f`. Its `turbo.json` has **zero** entries in the
`@sahoda/web#build` env allowlist against **46** on `wt-web`.

Turborepo 2 defaults to strict mode and strips every undeclared variable, so
`CLERK_SECRET_KEY` never reaches the build. Compilation succeeds, then page-data
collection throws, and **no route manifest is emitted**. The same build on
`wt-web` locally emits 25 routes.

**The secrets are set. The branch is too old to pass them through.**

The `wt-admin` merge is innocent. Rolling back would have cost it for nothing —
and was impossible anyway, because the target had been deleted.

### Three findings worth more than the incident

**Rollback targets are not durable.** Every push plan written for this project
ended with a named, verified rollback target. That target now returns `410 GONE`
— explicitly destroyed, not merely unrouted. A rollback target is only as
durable as the project hosting it. **Re-assert it immediately before the push,
not in the plan that precedes it.**

**Status codes hid three different truths.** Three surfaces returned `404
DEPLOYMENT_NOT_FOUND` (nothing deployed), `410 GONE` (destroyed), and `302`
(exists, behind auth). Read as status codes alone — 404 / 410 / 302 — you would
conclude "missing, missing, redirect." Read as bodies, they tell you the
deployment is absent, the rollback target is destroyed, and the surviving
artifact is an errored build behind a protection gate. **Fourth instance of the
same lesson**, after the `exit 0` lint, the unseen cron 500s and Zernio's HTML
catch-all.

**The public repository is a smaller problem than it looked.** The secret scan
came back clean across all refs — no real `.env` has ever been committed, only
`.env.example` with empty values; every hit for the six credential patterns is
an empty template key or an obvious test fixture. What is public is the
production Supabase project ref and eight audit documents: a map, not keys.
Every path into that database still needs the anon key plus a valid Clerk JWT,
or the service-role key, and neither is in the repo. **Real risk drops from
"credentials are loose" to "an attacker knows which door to knock on."** Worth
closing, no longer an emergency. The `.gitignore` discipline bought that.

### The rule this produces

> **Infrastructure that hosts production — the Vercel project, the GitHub
> repository, the Supabase project — is founder-approval-only. No exceptions.
> The approval is an explicit message, never an assumption.**

Deleting and recreating the Vercel project and the repository is the most
irreversible action available in this stack. It destroyed the rollback target
for every merge in flight and cost a day of uptime for 17 users. This goes
alongside the existing non-negotiables in doc 15 §2.

---

## 2. Corrections to doc 15

**§4 task 0.2 — no longer cosmetic, and half-done.** Doc 15 deferred "`main`
becomes the trunk" past beta as hygiene. On the new remote, `main` is a stale
single commit that (a) production is trying and failing to build and (b) anyone
visiting the public repo would read as the project. The GitHub half is done —
default branch is now `wt-web`, `main` tagged as `archive/main-initial-commit`.
The Vercel half is the live outage. **Promoted from deferred to P0.**

**§12 — SL-043 was under-rated, by me.** A rehearsal database is not hygiene. It
is the gating dependency for testing the payment slice at all: `packages/billing`
holds 19 test files that have never executed (SL-050), Slice A lives in that
package, and it touches the ledger. Divas priced it correctly with a costed plan
at `docs/audit/2026-07-30-staging-project-plan.md`. **Read that plan before
sequencing Stream 1.**

**Board encoding — ruling reversed.** `scripts/lib/ops-state.mjs:59` writes
`JSON.stringify(value, null, 2)` deliberately, so Prettier's rewrite is a no-op.
Holding ASCII escapes as the target means fighting the tooling forever, one
55-line flip per hook run. **Raw UTF-8 is the committed form.** The escaped
version was an older writer; the churn was the two finally agreeing.

**§14 timeline — the clock did not start.** Doc 15 counted from a Monday start.
Two days went to the outage and its diagnosis. The 24–40 working-day range for
beta capability is unchanged; it now counts from the day production is green.

---

## 3. Phase order as of today

### P0 — Restore service · *today*

Production is down for 17 users. Nothing else has standing.

Three routes, in order of preference: select **"the Git repository's default
branch"** in Vercel Settings → Git (now `wt-web`) rather than typing a custom
branch; or `vercel --prod` from the `wt-web` worktree, which bypasses the git
integration entirely; or the undocumented `vercel.com/api/v9/projects/{id}/branch`
endpoint the dashboard itself calls.

**Gate:** six unauthenticated GETs — `/`, `/sign-in`, `/home`, `/wallet`,
`/posts`, `/admin` — return `text/html` with rendered markup. Route count 25
before promotion. A status line is not the gate.

**Then close the plumbing.** A CLI production deploy restores service without
fixing the branch setting; push-to-deploy stays broken until it is corrected.

### P1 — Prove the rail · *today, parallel, blocks nothing*

Zernio has 22 `[LIVE]` markers on the connection layer and **zero on
publishing**. No post has ever been sent. The smoke test at
`~/zernio-smoke/run-smoke.sh` has never run.

This touches no repository, no worktree, no deployment, no database. It is
unblocked by the outage and it runs Slice D's gate by hand before a line of
Slice D exists.

**Gate:** a real post on a real Instagram account, and a raw `platformPostUrl`
saved to `raw/`. That field is what the entire `.is-real` binding keys off and
nobody has ever seen one.

**Prerequisite for Q2 only:** a second Instagram Business account. Everything
else runs on the existing connection.

### P2 — Test integrity · *starts when P0 is green*

- **0.4a — SL-050.** Make the 100 dead test files run. Fully scoped already.
  Blocks Stream 1.
- **SL-043 ruling.** Read the costed plan; decide whether staging comes before
  Stream 1 starts.
- **0.4 — real CI.** The variance in the whole plan: 3 days or 8, and nobody
  knows which until lint is switched on after six weeks of `exit 0` in eight
  packages.
- 0.5 R-02 hold sweeper · 0.6 Sentry.

### P3 — Build slices

Unchanged from doc 15 §5. Stream 1: Slice A (money). Stream 2: B → C → D → E.
Two streams, not four — the ceiling is founder review bandwidth, not terminals.

**Neither stream pushes until 0.4 is green.**

### Not on the build path

KYC, legal, Google verification, the second Instagram account, the landing page
and the UI reskin are all founder-owned or externally owned. They consume zero
build days and are tracked outside this roadmap.

---

## 4. New board cards

Nine cards. **Board goes 49 → 58.**

`roadmap_code` and `board_column` are deliberately left as instructions rather
than values: read the distinct values already present in `ops/state/board.json`
and map to an existing one. Do not invent a new enum value.

---

**SL-054** · sort `5` · column: *in progress*
**Title:** Production is down — Vercel builds the stale `main` branch

Since 30 July ~19:29 IST every route on every domain returns `text/plain`
`DEPLOYMENT_NOT_FOUND`. The Vercel project was recreated and points at `main`,
which on the new remote is a single "Initial commit" of 490 files predating
`ba32a3f`. Its `turbo.json` has 0 entries in the `@sahoda/web#build` env
allowlist against 46 on `wt-web`; Turborepo 2 strict mode strips
`CLERK_SECRET_KEY`, page-data collection throws, no route manifest is emitted.
Secrets are set correctly — the branch is too old to pass them through. Fix:
point production at `wt-web` (`8f9a0db`) or deploy via CLI. Gate: six
unauthenticated GETs returning `text/html` with rendered markup, route count 25
before promotion. 26 workspaces and 17 users are affected. Rollback is
impossible — `dpl_8te1K3q…` (`ef50fb6`) returns 410 GONE, destroyed with the old
project.

---

**SL-055** · sort `15` · column: *backlog*
**Title:** Infrastructure that hosts production is founder-approval-only

On 30 July the GitHub repository and the Vercel project were deleted and
recreated without founder approval. This destroyed the rollback target for every
merge in flight and caused a day of downtime for 17 users. Rule, effective
immediately: the Vercel project, the GitHub repository and the Supabase project
may not be deleted, recreated or re-linked without an explicit founder message.
Not an assumption, not an inference from a plan. This is the most irreversible
class of action in the stack and it sits alongside the non-negotiables in doc 15
§2.

---

**SL-056** · sort `20` · column: *backlog*
**Title:** Rollback targets must be re-asserted immediately before the push

Every push plan in this project ended with a named, verified rollback target —
`dpl_8te1K3q…`, `isRollbackCandidate: true`. It now returns 410 GONE. The safety
architecture of several sessions rested on an artifact verified once, at one
moment, that nothing re-checked and that a project deletion evaporated. A
rollback target is only as durable as the project hosting it. Process change:
re-assert the target exists and is promotable in the same session as the push,
not in the plan that precedes it. Assert on the response body, not the status.

---

**SL-050** · sort `25` · column: *todo*
**Title:** 100 test files have never executed — five packages have no vitest config

`packages/shared` (7 files), `billing` (19), `mesh` (14), `publishing` (8) and
`sites` (52) have no `vitest.config.*` or `vite.config.*`, and there is no
workspace or projects key. Each falls back to the repo-root config, whose
`include` is `['scripts/**/*.test.mjs']`, resolved against the package as root —
matching nothing, since every test lives under `src/`. Their script is
`vitest run --passWithNoTests`, which turns "found nothing" into exit 0. Only
`packages/db`, `apps/web` and `apps/jobs` have ever run anything. All five also
still carry `lint: exit 0` (SL-033, live). **Blocks Slice A: `packages/billing`
holds 19 unrun test files and the payment slice lives there.** Task 0.4a. Scope
the failures before fixing — switching this on after six weeks may reveal a lot.

---

**SL-051** · sort `30` · column: *todo*
**Title:** The QA evidence hook counts skipped tests as passed

`scripts/lib/ops-classify.mjs:132-135` — `countsFor()` has a regex for `passed`
and one for `failed` and **none for `skipped`**. Vitest prints
`Tests 71 passed | 202 skipped (273)`; the 202 is invisible. A run where 202
database tests never executed was recorded as "the checks ran and everything
passed." Contributing factor at `:166`: `stripAnsi(output).slice(-4000)` keeps
only the tail, so the skip lines never reach the classifier and `apps/web`'s
count gets attributed to a suite labelled typecheck. Fix: add
`skipped: sum(/(\d+)\s+skipped/i)` and make the summary sentence at `:189`
conditional on it being zero. Note the shape of the bug — the function was
hardened three times against *understating* success, with a comment at `:43-44`
saying understatement "is its own kind of dishonesty," and nobody asked whether
a test that never ran should count as one that passed. Direct violation of doc
15 §2 rule 3.

---

**SL-052** · sort `35` · column: *backlog*
**Title:** `board.json` encoding churn makes board diffs unreviewable

`scripts/lib/ops-state.mjs:56-60` writes state as raw UTF-8 via
`JSON.stringify(value, null, 2)`; an older writer produced ASCII-escaped
`\uXXXX`. Every `writeState('board', …)` re-encodes the whole file — commit
`8f9a0db` shows 63 insertions / 63 deletions of which only 8 lines are real
content. **Ruling: raw UTF-8 is the committed form**, because `:48-54` documents
that the current encoding deliberately matches Prettier's output so the
formatter's rewrite is a no-op. Reverting to escapes would be flipped back by
the next hook run. Remaining work: confirm no other writer produces escapes, and
add an assertion to the board resolver.

---

**SL-053** · sort `40` · column: *backlog*
**Title:** `p_storage_path` validated only in the application layer

`ops_qa_artifact_add` accepts any text for `p_storage_path`; the
`qa/<runId>/` prefix is enforced only at `apps/web/src/lib/ops/ops-qa.ts:209`.
The RPC is granted to `authenticated`, so a PostgREST caller can pass an
arbitrary path. **Not privilege escalation** — the run must be the caller's own
and still running (`ops_credit_self_approve_gate.sql:197`), and the bucket
policy is admin-only, so nothing becomes readable that was not. Data-integrity
wrinkle only. Flagged because the same migration argues eight lines earlier at
`:185-186` that validation living only in the application "disappears the first
time somebody calls storage directly" — reasoning that applies verbatim here and
was not applied.

---

**SL-057** · sort `45` · column: *todo*
**Title:** The repository is public

`development156/sahodalabs` is public. Secret scan across all refs came back
clean: no real `.env` has ever been committed, and every hit for
`SUPABASE_SERVICE_ROLE`, `CLERK_SECRET_KEY`, `sk_`+64hex, `CASHFREE`,
`OPENROUTER` and `DEVOPS_INGEST_TOKEN` is an empty `.env.example` key or a test
fixture. What is exposed is the production Supabase project ref across 10 files
and 8 audit documents — a map, not keys. Access still requires the anon key plus
a valid Clerk JWT, or the service-role key; neither is in the repo. 0 forks, 0
stars, so privatising is still effective rather than symbolic. **Downgraded from
emergency to routine.** No rotation required.

---

**SL-058** · sort `50` · column: *todo*
**Title:** Restore push-to-deploy after the CLI production deploy

A `vercel --prod` restore is not tied to a git commit, so it brings the site back
without fixing the underlying setting. Until Vercel's production branch is
corrected to `wt-web`, pushing to trunk does not deploy. Close this once the
Settings → Git page reads `wt-web` after a hard refresh **and** a push to
`wt-web` produces a production deployment. Note that Vercel's production branch
has three modes — the `main` branch, the repository's default branch, or a
custom branch — and new projects default to `main` where it exists. Selecting
"the repository's default branch" now resolves to `wt-web`.

---

## 5. Assertions for the board update

Run these or the update is unverified:

1. Card count is **exactly 58** after the write.
2. The ID set equals the previous 49 plus exactly `SL-050` … `SL-058`.
3. No existing card's `title` or `detail` changed. Diff only shows additions.
4. `SL-043` remains at `sort: 10`. Nothing displaces it except `SL-054` at 5.
5. Encoding is raw UTF-8 throughout — 0 `\uXXXX` escapes.
6. Every `roadmap_code` and `board_column` value already exists elsewhere in the
   file. No new enum values.
7. `scripts/lib/ops-seed-data.mjs` updated to match, so a fresh seed produces
   the same 58 cards.

---

## 6. What the roadmap card should show

| Phase | State |
|---|---|
| P0 — Restore production | 🔴 In progress |
| P1 — Prove the publishing rail | ⬜ Unblocked, not started |
| P2 — Test integrity | ⬜ Blocked on P0 |
| P3 — Slice A: money | ⬜ Blocked on SL-050 |
| P3 — Slices B–E: connect and publish | ⬜ Blocked on P2 |
| Beta capability | 24–40 working days from the day production is green |

**Honest framing for the progress card:** by code volume the product is well
past halfway. By *can a real customer complete a journey and pay for it*, closer
to a quarter — and the remaining quarter contains every hard part. The progress
card should reflect the second number, not the first. Showing the first would be
a fake success state, and doc 15 §2 rule 3 forbids it.
