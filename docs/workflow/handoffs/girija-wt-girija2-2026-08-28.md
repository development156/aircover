# Handoff — girija — wt-girija2 — 2026-08-28

**Branch** `claude/lead-research-kickoff-qexr94` at `cd4548e1`. Lane `wt-girija2`.
Pushed: **yes**. PR [#24](https://github.com/development156/sahodalabs/pull/24),
draft, into `wt-core`.

**The branch was restarted from `wt-core` at the start of this session.** PR #17
from this same branch was merged on 2026-08-27 by IDIVASM, so the branch carried
only already-merged history and could not track new work. It was cut fresh from
`origin/wt-core` at `bf46eaa4` and force-pushed with lease. Nothing was lost:
`git rev-list --left-right --count` showed 0 ahead of `wt-core` before the reset.

---

## What shipped

Two commits. The first is documentation, the second is the founder's
consolidation items 2 to 4.

| # | What                                                                                              | Proof                                                                    | Covered by                                                                       |
| - | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1 | `docs/56` — the Marketing Brain capability reference: the five kinds with the sentence each produces, four reusable properties, a filing rule, and the ROAS reading | `e599f194`, `docs/56_Marketing_Brain_Capability_Reference.md`             | prose; no executable claim                                                       |
| 2 | `marketing_pass_runs` — one row per workspace per weekly pass: the day, what it wrote, why each computer produced nothing | `cd4548e1`, `packages/db/supabase/migrations/20260828060000_marketing_pass_runs.sql` | `packages/db/tests/marketing_pass_runs.pglite.test.ts` (12 tests, real Postgres) |
| 3 | `savePassRun` and the runner wiring, with the write INSIDE the try so a thrown workspace records nothing | `apps/web/src/lib/brain/store.ts`, `apps/web/src/lib/brain/run.ts:247`    | `apps/web/src/lib/brain/run.test.ts` (17 tests, 4 of them new)                    |
| 4 | `lib/brain/waiting.ts` — the empty state says when it last looked and what it is short of, instead of one static sentence | `apps/web/src/lib/brain/waiting.ts`                                      | `apps/web/src/lib/brain/waiting.test.ts` (13 tests)                               |
| 5 | `/report` renders it                                                                              | `apps/web/src/app/(app)/report/page.tsx:378`                             | logic lives in `waiting.ts`; the page is a thin renderer with no test of its own  |
| 6 | `caption_rewrite` and `content_variants` read the Marketing Brain — 3 of 8 mesh tasks, up from 1  | `packages/mesh/src/tasks/caption-rewrite.ts:98`, `content-variants.ts`   | each task's own ordering test, plus the reach guard below                         |
| 7 | The reach guard: `market-injection.test.ts` NAMES the permitted readers                           | `packages/mesh/src/market-injection.test.ts:165`                         | itself, mutated                                                                   |
| 8 | The cost of one table, paid: operator-only set, DPDP export manifest, `docs/38`'s list and count  | `packages/db/tests/rls_tenant_isolation.pglite.test.ts`, `apps/web/src/lib/privacy/export-manifest.ts`, `docs/38_Data_Handling.md` | the three guards that went red and then green                                     |

**Item 1 of the founder's four — promoting `wt-core` to `wt-web` — was NOT
attempted.** It is the one gated step in the system and is not a lane's to take.

### The two design calls worth carrying forward

**A table, not an Upstash key.** `lib/cron/heartbeat-store.ts` argues correctly
for Redis on "did this job run": one number per job, overwritten forever, never
read historically. This question is the opposite on all three counts, and
`docs/55` step 10 says the history of not knowing is the asset a competitor
starting today cannot copy. A 30-day TTL cannot hold that.

**Every threshold in the copy is imported from the computer that gates on it.**
`waiting.ts` reads `MIN_POSTS_PER_WINDOW`, `MIN_WINDOW_DAYS`, `MIN_AUDIENCE` and
the rest from the five observe modules, and a test asserts each sentence against
its constant. A "five posts" typed into the copy layer would be a second source
of truth for a product promise and would go wrong the first time someone tuned a
floor.

---

## What was NOT done, and why

- **The migration is applied to no database.** `db push` is gated on human
  approval and was not requested. Until it is applied, `/report` can only render
  the "never examined" arm, and the DPDP export lists the table and reports it as
  unreadable — which degrades honestly (`export.ts` reports a failed read per
  table) but is noise.
- **Tier A only on the empty state.** It says what is needed, not how far short
  the workspace is. "You have 3 of the 5 it needs" would require all five
  computers to return a measurement beside their reason — a wider diff than this,
  and deliberately deferred rather than overlooked.
- **`test:smoke` UNRUN, not passed.** See the Gate section; the reason changed
  this session and is worth reading.
- **No screen was seen by anyone.** Chromium in this sandbox reaches nothing, and
  the Vercel preview is behind Vercel SSO on top of Clerk. QA-1 to QA-6 in the
  QA plan given to the founder need a human.
- **`live-guard.test.ts` was left failing** and is another lane's file. See
  "Anything retracted" — it is a real finding, not an environment excuse.
- **CI has never verified `cd4548e1`.** Six dispatches, none of which ran.

---

## Shared surfaces touched

**Four, and all four are additive rather than breaking.**

| Surface                                                | Change                                                                                     | Who it affects                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/db/supabase/migrations/`                      | ONE new file, `20260828060000`. No applied migration edited                                | Anyone rebasing a migration; pick a later timestamp                          |
| `packages/mesh/src/tasks/caption-rewrite.ts`, `content-variants.ts` | `buildMessages` gained a FIFTH positional parameter, `market?: ChatMessage`                 | Any caller passing positionally. Both are optional, so existing calls compile |
| `apps/web/src/lib/brain/read.ts`                        | `BrainRead`'s `ok` arm gained a REQUIRED `lastPass` field                                  | **A constructor of that type breaks; a reader does not.** Only `/report` constructs it |
| `apps/web/src/lib/privacy/export-manifest.ts`           | One row added to `EXPORT_TABLES`                                                            | `export-drift` compares it to the live schema — see below                     |

**The one to watch:** `EXPORT_TABLES` now names a table that does not exist in
production. `export-drift.test.ts` asserts `phantom` is empty and would go red on
that — but it runs only where `SUPABASE_DB_URL` is set, and turbo's strict env
mode strips it, so the gate skips it. **Applying the migration resolves it. Do
not "fix" it by removing the manifest row.**

`packages/shared` was NOT touched.

---

## Contract, migration or money

**One migration, no contract change, no money.**

`20260828060000_marketing_pass_runs.sql`: one table, `workspace_id` + FK +
cascade, one index, RLS enabled, member SELECT scoped to
`app.member_workspace_ids()`, operator SELECT on `app.is_ops_admin()`, and **no
write policy for anybody** — the pass writes over the service role. Policy set
copied from `20260825000000_marketing_observations.sql` and for its stated
reasons.

`packages/shared` untouched, so `OBSERVATION_KINDS` did not move and no `kind`
CHECK needed widening. No price, no ledger, no credit path.

---

## Guards written, and the mutation that proved each

Nine mutations, every one applied, run, and WATCHED go red, then restored and
watched go green.

| # | Mutation                                                              | Result                                     |
| - | ----------------------------------------------------------------------- | -------------------------------------------- |
| 1 | `t_select` unscoped to `using (true)`                                  | **2 red**                                    |
| 2 | A member `for all` write policy added                                  | **4 red**                                    |
| 3 | `unique (workspace_id, computed_on)` removed entirely                  | **suite errors at setup, exit 1 against 0**  |
| 4 | `check (jsonb_typeof(declines) = 'object')` removed                    | **2 red**                                    |
| 5 | `savePassRun` moved from the `try` into the `catch`                    | **4 red**                                    |
| 6 | The per-workspace `perWorkspace = {}` reset deleted, so reasons leak   | **1 red**                                    |
| 7 | Market block moved above brand in `caption-rewrite`                    | **1 red**                                    |
| 8 | A fourth task given `wantsMarketContext` without updating the list     | **1 red**                                    |
| 9 | `content_variants` drops the flag                                      | **1 red**                                    |

**#3 is the weakest of the nine and is recorded as such.** Removing the unique
key breaks the `on conflict` in the test's own writer, so the suite errors at
`beforeAll` rather than one assertion going red. MEASURED as exit **1** against
exit **0** restored, which is a genuine failure, but it is a setup error and not
a targeted red. A stronger guard would assert the constraint's existence
directly.

---

## Anything retracted

**Two, and the second is a real finding rather than a correction.**

**1. `REQUESTS §25` is now wrong in one half.** It records that Chromium in this
sandbox loads plain-HTTP `example.com` with 200 and that only HTTPS resets.
MEASURED today on this lane, through `/opt/pw-browsers/chromium` (the repo's
pinned Playwright wants build 1228; the sandbox has 1194, so `executablePath` is
required):

| target                            | result                    |
| --------------------------------- | ------------------------- |
| `http://example.com/`             | **ERR_CONNECTION_RESET**  |
| `https://example.com/`            | **ERR_CONNECTION_RESET**  |
| the same, forced through `HTTPS_PROXY` | **ERR_CONNECTION_RESET**  |
| Node `fetch` to the Vercel preview | **302 to `vercel.com/sso-api`** |

The browser's egress is now blocked outright, not selectively, and the old note
would send the next person hunting a TLS problem that is not there. The
`mcp__playwright__*` tools are separately unusable: the MCP server is pinned to
Chrome channel `chrome` at `/opt/google/chrome/chrome`, which is not installed.

**2. `packages/db/tests/live-guard.test.ts` asserts the wrong thing.** Its third
case proves "the repo-root .env was not read" by checking `ENV.dbUrl === ''`.
MEASURED: this container **exports** `SUPABASE_DB_URL` into the process, so
`helpers/env.ts:39` reads it straight from `process.env` and the assertion fails
without dotenv ever running. The protection it guards still holds —
`hasLedgerEnv` and `hasRlsEnv` gate on the flag and are false — so no live suite
can run. It is the assertion that is wrong, not the gate. **Left untouched: it is
another lane's file and weakening it to pass here would be exactly the defect it
exists to catch.**

---

## Anything that changes an assumption

**GitHub Actions has not executed a job on this repository since roughly 11:28Z,
and the cause may be billing rather than infrastructure.**

MEASURED — six gate attempts, every one dead before a runner was assigned:

| run                              | window            | duration | logs |
| -------------------------------- | ----------------- | -------- | ---- |
| 33167258442 attempt 1            | 11:28:05 → 11:28:07 | 2s       | 404  |
| 33167258442 attempt 2            | 11:29:09 → 11:29:11 | 2s       | 404  |
| 33170995559 (hand-dispatched)    | 12:25:12 → 12:25:14 | 2s       | —    |
| 33175632385 (hand-dispatched)    | 13:29:39 → 13:29:44 | 5s       | —    |
| 33183550773 (hand-dispatched)    | 15:06:59 → 15:07:02 | 3s       | —    |
| 33193503398 (hand-dispatched)    | 17:11:17 → 17:11:19 | 2s       | —    |

**The same check passed on this branch at 07:13Z in 12m20s** (run 33150617765,
on `e599f194`). So Actions was healthy this morning and stopped mid-day.

**INFERRED, unconfirmed, and put to the founder at 17:13Z:** the account has
exhausted its included Actions minutes or hit its spending limit. MEASURED
supporting facts: the repository is **private**, on a **personal account**,
created 2026-07-30, and `gate.yml` is on **run number ~660**. Private repos bill
minutes; a green gate costs about twelve. Every symptom fits — instant failure,
no runner, no logs, account-wide, and a mid-day onset. Reading billing needs a
scope this token lacks, so it is a hypothesis and is labelled one. **If it is
right, no retry from any session ever fixes it and the 26 August episode was the
same thing.**

One standing comment exists on the PR
([issuecomment-5451977654](https://github.com/development156/sahodalabs/pull/24#issuecomment-5451977654))
naming the failing check and why it is not this PR's. **Do not add a second.**
A check-in is armed for 20:13Z and re-arms itself.

---

## What the next session in THIS lane should pick up

1. **Ask whether the Actions billing hypothesis was checked.** It gates every
   CI claim this lane can make, and it is one page in GitHub settings.
2. **Apply `20260828060000`** when the founder approves. It unblocks the "last
   looked, and waiting for" arm of `/report`, resolves the `export-drift`
   phantom, and lets `/admin/brain` show pass rows.
3. **Get a human onto `/report`.** Nobody has seen the new empty state. The
   preview is behind Vercel SSO and no cloud session can reach it.
4. **Tier B on the empty state** — the shortfall numbers — is the natural next
   increment and needs all five computers to return a measurement beside their
   reason.
5. **`docs/55` steps 5 to 9 are untouched.** Step 5, `leads.post_id` and
   attribution, is the one the founder was told is urgent because it cannot be
   retrofitted onto traffic that has already happened.
6. The `live-guard` finding above needs an owner who is allowed to touch it.

---

## Gate

Run from the repo root, unpiped, exit codes read from the command itself.

| leg                                                          | result                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `turbo run typecheck test --filter="...[origin/main]"`        | **PASS** — `Tasks: 18 successful, 18 total`; `@sahoda/web` `453 passed \| 3 skipped (456)`   |
| `pnpm format:check` (`prettier --check .`)                    | **PASS** — `All matched files use Prettier code style!`, exit 0                              |
| `pnpm gate` leg 1, `turbo-typecheck-lint-test`                | **PASS**, 149.4s                                                                             |
| `pnpm gate` leg 2, `vitest-root`                              | **PASS**, 3.0s                                                                               |
| `pnpm gate` leg 3, `turbo-smoke`                              | **REFUSED, not failed.** `decision refused-unacknowledged` — it would write to project `rloztdhzfliyvpvxsgjl` without `SAHODA_E2E_ACK_TARGET`. **The guard working.** UNRUN, not passed |
| `packages/db` full suite                                      | **PASS** after the three table guards were paid; `live-guard` red for the environment reason above |
| `apps/web` bare `npx vitest run`                              | **2 failed** — `export-drift.test.ts` only, `getaddrinfo ENOTFOUND` on an IPv6-only Postgres this container cannot open. It **SKIPS** under turbo, which strips `SUPABASE_DB_URL` under strict env mode. That is why the gate is green and a bare run is not |
| CI `typecheck · lint · test · format` on `cd4548e1`           | **NEVER EXECUTED.** Six attempts, none reached a runner. Not passed, not failed              |

**The smoke leg's refusal is new information this session** and is not the
sandbox's Chromium problem. It refuses before launching a browser, because the
acknowledgement is missing. Both walls are real; this is the first one.
