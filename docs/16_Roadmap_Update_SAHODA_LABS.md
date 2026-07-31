# 16 — Roadmap and Board Update

**Written:** 31 July 2026
**Amends:** `15_Beta_Launch_Plan_SAHODA_LABS.md` §4, §12 and §14. Doc 15
otherwise stands.
**Companion:** `13_Zernio_Integration_SAHODA_LABS.md`, unchanged.
**Board:** 49 cards today → **59** once §4 is applied.

This document exists because the world moved between doc 15 being written and
today, and because nine defects found since then have no cards. It is both a
readable roadmap and the source text for the board update in §4.

---

## 0. Status at time of writing

| | |
|---|---|
| **Production** | ~~**DOWN** since 30 July ~19:29 IST. Every route on every domain returns `text/plain` `DEPLOYMENT_NOT_FOUND`~~ **Superseded — see §1a.** Partly a measurement error: the host measured was never attached to this project. As of 31 July 22:15 IST the site serves, `/sign-in` renders, and four routes 404. |
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
`CLERK_SECRET_KEY` never reaches the build. ~~Compilation succeeds, then
page-data collection throws, and **no route manifest is emitted**.~~
**Corrected 1 Aug — see §1b: the build FAILED outright.** The same build on
`wt-web` emits 25 routes.

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

> **And: production actions run in ONE NAMED SESSION AT A TIME.** On 31 July a
> second Claude Code session ran `vercel --prod` at 17:47 IST, ten minutes
> before P0 was assigned to this one. Nothing broke, but for twenty minutes two
> sessions held contradictory beliefs about whether production had been
> deployed, and the P0 diagnosis was written against a surface that a *different*
> session had already fixed. Concurrency did not cause the outage; it made the
> outage impossible to reason about. Whoever holds production says so, and
> nobody else touches it until they hand it back.

Deleting and recreating the Vercel project and the repository is the most
irreversible action available in this stack. It destroyed the rollback target
for every merge in flight and cost a day of uptime for 17 users. This goes
alongside the existing non-negotiables in doc 15 §2.

---

## 1a. Corrections to §0 and §1 (31 July, 22:15 IST)

Doc 16 is law, and §0/§1 as written describe an outage that was **partly a
measurement error**. Three corrections, each measured rather than reasoned.

**1. `sahodalabs.vercel.app` was never attached to this project.** That is the
host §0 measured returning `text/plain` `DEPLOYMENT_NOT_FOUND`, and it would
have returned that forever regardless of the branch setting — it was absent from
the project's domain list. The project's own hosts were
`sahodalabs-development-4417s-projects.vercel.app` and
`sahodalabs-git-main-…`. This is a **fifth** instance of the §1 lesson, and the
sharpest: the body was read correctly, but the *target* was wrong, so a correct
reading of the wrong surface produced a confident wrong conclusion. Reading
bodies is necessary and not sufficient — confirm the surface belongs to the
system under test.

**2. A correct production deployment already existed.** `dpl_4MgVUFzh…`, READY,
built from `wt-web` @ `8f9a0db2` via `source: cli`, created **31 July 17:47
IST** by another Claude Code session — the §3 fallback route, already run,
roughly ten minutes before P0 was assigned. Its build emitted a **complete
25-route manifest**, so §1's root cause ("no route manifest is emitted") had
already stopped applying. Nobody knew, because the surface being measured was
the unattached host.

**3. The blocker was `ssoProtection`, not an errored build.** The project had
Vercel Authentication enabled at `all_except_custom_domains`, so every
`*.vercel.app` URL answered `302` + `text/plain` "Redirecting…". §1 read that
302 correctly as "exists, behind auth" but attributed it to *an errored build*
behind a gate. The build was fine; the gate was the whole problem. Disabling it
was one reversible API call and is what made the site reachable.

**Also corrected:** §2 asserts push-to-deploy is broken until Vercel's
production branch is fixed (SL-058). A push to `wt-web` on 31 July produced
`dpl_EB5EmZ5J…`, `source: git`, `target: production`, which claimed
`sahodalabs.vercel.app`. **Push-to-deploy from `wt-web` works today.** SL-058's
remaining value is confirming *why* — whether Settings → Git already reads "the
repository's default branch" — not restoring the behaviour.

### What is still broken, and what is NOT yet proven

`/`, `/home`, `/wallet` and `/posts` return `404` with `x-matched-path: /404`
raised in **edge middleware**, for signed-out visitors, with **zero runtime
errors**. `/sign-in` renders (200, ~12.9 kB). `/admin`'s empty 404 is correct by
design (doc 13 §2). `/` redirects to `/home`, so this is **one defect, not
four**. Reproduced identically from bare curl and from a browser-shaped client
with a cookie jar, so it is not a client artefact.

**Measured:** production serves Clerk **development** keys —
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` begins `pk_test_bGVh`, frontend API
`leading-hyena-7.clerk.accounts.dev`. Read from the served HTML, where the
publishable key is public by design.

**NOT proven:** that the key environment *causes* the 404. `middleware.ts:103`
calls `auth.protect()`, which should answer `307`, and
`middleware.test.ts:78` asserts exactly that. Production answers `404` with no
error logged. Vercel runtime logs show `GET / 307` at 16:17 UTC on
`dpl_7CBNK9Yk…` — so a redirect **did** occur under some condition — while the
same URL answers 404 now. That inconsistency is unexplained and the causal
link is unestablished. **Do not treat a Clerk instance migration as a
guaranteed fix for this 404** — see §7 for what it costs if it is not.

---

## 1b. Root cause, re-verified (1 August)

§1's mechanism was written when every measurement behind it had a flaw. It has
now been proved **independently of any of them**, from `main` itself and from
Vercel's own build log — and it is right, with one correction that matters.

### The evidence

| # | Claim | How it was checked |
|---|---|---|
| 1 | `main` declares no build env | `git show origin/main:turbo.json` — there is **no `@sahoda/web#build` task at all**, and `globalEnv` is `[]`. Stronger than §1's "zero entries". |
| 2 | Strict mode strips the server vars | The failed build's own log lists ~36 `[warn] - VAR` lines — `CLERK_SECRET_KEY`, `SUPABASE_*`, `TOKEN_VAULT_KEY`, every one — as set on the project but absent from `turbo.json`. |
| 3 | The build fails | `Tasks: 0 successful, 1 total` · `Failed: @sahoda/web#build` · `exited (1)`. |
| 4 | It failed every time | All three `main` deployments (`dpl_2MnWmPN8`, `dpl_5CDdW9AV`, `dpl_DQTf21wx`) are `state: ERROR`. |
| 5 | Nothing was ever served | Runtime logs grouped by `deploymentId` over three days name only the four **wt-web** deployments. Not one request reached a `main` build. |

### The correction

§1 says compilation succeeds and no route manifest is emitted — describing a
deployment that **serves but has no routes**. That is not what happened. The
build **failed**, so the deployment never existed at all.

The distinction is not pedantic; the two have different symptoms and different
fixes. A routeless deployment answers `404` from *your app*. A failed build
leaves the project with no production deployment, so Vercel's edge answers
`DEPLOYMENT_NOT_FOUND` before any of your code runs — which is exactly what was
observed, and is why no amount of reading the app's behaviour would ever have
explained it.

`NEXT_PUBLIC_*` is untouched by this: Turborepo **framework-infers** it for
Next.js packages, which `apps/web/src/lib/turbo-env-wiring.test.ts` already
documents and deliberately excludes from the allowlist requirement. So the
46-entry list protects **server variables only** — correct, known, and tested
since 27 July. It is not a second gap.

---

## 1c. The outage window

§0 asserts "DOWN since 30 July ~19:29 IST" without support. What is now
supportable:

| Boundary | When | Confidence |
|---|---|---|
| Outage begins | Between **30 Jul 19:01 and 19:29 IST** — when the old Vercel project was destroyed | **Bounded, not pinned.** The old project is gone, so its last served request is unrecoverable. |
| New project's first failure | 30 Jul **19:29:43 IST**, four seconds after the project was created | Exact |
| Last failed `main` build | 30 Jul **21:35:35 IST** | Exact |
| First deployment that served | 31 Jul **17:47:43 IST** (`dpl_4MgVUFzh`, CLI, `wt-web`) | Exact |
| Reachable without a Vercel login | 31 Jul **~18:05 IST**, when `ssoProtection` was disabled | ±few minutes |

**Nothing was deployed for 22 h 18 min** (30 Jul 19:29:43 → 31 Jul 17:47:43),
and zero requests were served in that window — the ERROR deployments have no
runtime logs at all. Add roughly twenty minutes behind the Vercel auth gate
before the site was reachable by anyone without a Vercel account.

**Answer for the 17 users: approximately 22 hours 40 minutes**, beginning
somewhere in the 19:01–19:29 window on 30 July. The lower bound is honest — the
exact start died with the old project, which is itself an argument for §1's
rollback-durability finding.

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

Nine cards, plus **SL-059** added 31 July. **Board goes 49 → 59.**

`roadmap_code` and `board_column` are deliberately left as instructions rather
than values: read the distinct values already present in `ops/state/board.json`
and map to an existing one. Do not invent a new enum value.

---

**SL-054** · sort `5` · column: *in progress*
**Title:** Production was down 22h40m — the recreated Vercel project could not build `main`

**Rewritten 1 Aug against verified evidence only.** The original detail was
inferred from measurements that have all since been withdrawn (wrong host, an
SSO gate mistaken for a broken build, and probes sent with `Accept: */*`).

What is proved: the recreated Vercel project built `main`, which on the new
remote is a single "Initial commit" of 490 files. Its `turbo.json` has **no
`@sahoda/web#build` task at all** and an empty `globalEnv`, so Turborepo 2's
strict mode declared nothing and stripped ~36 server variables —
`CLERK_SECRET_KEY`, every `SUPABASE_*`, `TOKEN_VAULT_KEY`. The build **failed**
(`Tasks: 0 successful` · `exited (1)`), all three attempts ERRORed, and **not
one request ever reached a `main` build** — the runtime logs contain none.

So there was no production deployment at all, and Vercel's edge answered
`DEPLOYMENT_NOT_FOUND` before any application code ran. Secrets were set
correctly throughout; the branch was too old to declare them.

Down from between 19:01 and 19:29 IST on 30 July (when the old project was
destroyed — the exact moment died with it) until ~18:05 IST on 31 July, when
`ssoProtection` was disabled on a working `wt-web` deployment. **≈22 h 40 min**,
26 workspaces and 17 users affected. Rollback was impossible: `dpl_8te1K3q…`
returns 410 GONE.

Fixed by a CLI deploy from `wt-web` at 17:47 IST plus disabling deployment
protection. Push-to-deploy from `wt-web` has since been confirmed twice.
Gate: `pnpm probe:prod` (SL-059) — six routes, browser headers, judged on where
the redirect chain ends.

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

**SL-059** · sort `10` · column: *todo*
**Title:** The middleware layer has never been tested against a running server

`middleware.test.ts:78` asserts `/`, `/home`, `/wallet`, `/planner`, `/posts`
and `/connections` are protected — meaning `auth.protect()` answers a redirect.
Production answers **404**. The test passes; the behaviour it describes does not
happen. 17/17 green, mutation-tested on 28 July, and it did not catch a total
auth-routing failure on the six most important routes in the product.

The reason is structural, not sloppiness: that suite **reads the source and
asserts on its shape** (`expect(code).toContain('return notFound(csp)')`). It
can prove the code says the right thing. It cannot prove the code *does* the
right thing, because no server ever runs. The middleware gap documented on
26 July was theoretical; on 31 July it shipped.

What it would take, cheapest first:

1. **A post-deploy smoke probe** (hours). Assert `GET /home` → `307` with
   `location` containing `/sign-in`, against the real deployment, in CI after
   every production deploy. This alone would have caught this exact defect the
   moment it shipped. Assert on the redirect target, not the status class —
   §1's lesson, and note that a 404 and a 307 are both "not 200".
2. **`next build && next start` integration tests** (1–2 days). Boot the real
   server in CI and drive it with `fetch`. Catches middleware + routing +
   route-group composition together. Needs a test env with Clerk test keys,
   which is why it has not happened.
3. **Playwright against a preview deployment** (2–3 days, needs SL-043 first).
   The only tier that exercises real Clerk, real cookies and a real browser —
   and the only one that would have caught the dev-instance question. Blocked
   on staging, because today a preview writes to the production database
   (SL-049).

Tier 1 is the one to do now. Tiers 2 and 3 are the real answer and neither is
free. **Do not close this by adding another source-assertion test** — the
existing one is correct and proved nothing.


---

## 5. Assertions for the board update

Run these or the update is unverified:

1. Card count is **exactly 59** after the write (58 from the original nine, plus SL-059).
2. The ID set equals the previous 49 plus exactly `SL-050` … `SL-059`.
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

---

## 7. Clerk key swap — steps, and what breaks between them

**Founder-owned.** Written here so the cost is visible before it is paid.

### Read this first

**The key environment is measured; its link to the 404 is not.** Production
serves `pk_test_bGVh…` against `leading-hyena-7.clerk.accounts.dev` — certain,
read from the served HTML. That production runs a *development* auth instance is
independently worth fixing: dev instances cap at 100 users, carry no uptime
guarantee, and are not intended to hold real accounts. **But nothing here proves
it is what returns the 404.** `middleware.ts:103` calls `auth.protect()`, which
should answer 307; production answers 404 with no error logged; and the runtime
log shows a 307 on the same URL at 16:17 UTC. If the migration below is
performed and the 404 survives, the cost in §7.3 has been paid for a defect that
was somewhere else. Prove the causal link on a preview first.

### 7.1 The dependency nobody has costed

**A Clerk production instance requires a custom domain.** It cannot run on
`*.vercel.app`. The project has no custom domain attached today. So the real
first step is not a key swap — it is acquiring `app.sahodalabs.com` (or
equivalent), pointing it at Vercel, and adding the CNAME records Clerk issues
(`clerk.`, `clkmail.`, `clk._domainkey…`) plus DNS propagation time.

A custom domain also incidentally fixes the SSO question: deployment protection
was set to `all_except_custom_domains`, so a custom domain would have bypassed
it without disabling protection at all.

### 7.2 Order

1. Attach the custom domain to the Vercel project; verify it serves.
2. Create the Clerk **production** instance for that domain; add its DNS records.
3. Wait for Clerk to verify the domain.
4. Decide the user question in §7.3 **before** touching env vars.
5. In Vercel, replace `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   and `CLERK_WEBHOOK_SECRET` with the production instance's values — and scope
   them **Production only**, splitting today's single `Production, Preview` row.
   All three are currently one shared row each, the same shape as the Supabase
   variables in SL-049.
6. Re-register the `user.created` webhook against the production instance; the
   signing secret is new, so `CLERK_WEBHOOK_SECRET` must change with it.
7. Redeploy, then re-run the §3 P0 gate against the custom domain.
8. Remap the database (§7.3) before telling anyone the site is back.

### 7.3 What happens to the 17 users — the expensive part

**Clerk development and production instances are separate user directories.
The 17 people do not carry over.** They exist only in
`leading-hyena-7.clerk.accounts.dev`. In the new instance they do not exist at
all.

That matters far beyond "everyone gets logged out", which is merely true:
session cookies are signed by the old instance and all become invalid the
moment the keys change.

The real problem is **identity continuity**. This database keys authorisation on
the Clerk subject: RLS reads `auth.jwt() ->> 'sub'`, `ops_admins.user_id` holds
a Clerk `user_…` id, and `workspaces.created_by` holds another. A new instance
issues **new** user ids for the same humans. So on the first sign-in after the
swap, every one of them is a stranger:

- their workspaces are invisible — RLS matches nothing, so the app looks empty
  rather than broken, which is the worse failure;
- `/admin` 404s for every admin, because `ops_admins.user_id` points at a
  subject that no longer exists;
- any pending Clerk invitations are stranded in the old instance.

So the swap is a **user-directory migration**, not a configuration change:
export the users, import them into the production instance (Clerk's Backend API
supports import), build an `old_sub → new_sub` map keyed by email, and update
every column holding a Clerk subject inside one transaction. Between step 5 and
that remap, the site is authenticated but useless — signed in, and nothing
belongs to you.

**The cheaper alternative, worth considering seriously:** 17 people is a small
enough number to re-invite rather than migrate. That still needs the remap —
`ops_admins` seats are matched on `lower(email)` and relink through the
`user.created` webhook, so admin access self-heals, but `workspaces.created_by`
does not. Either way the remap is unavoidable; the question is only whether the
accounts are imported or recreated.

**Do this against staging first (SL-043).** Rehearsing a subject remap on the
only database that exists, holding 26 real workspaces, is precisely the risk
that card was promoted to the top of the board to remove.
