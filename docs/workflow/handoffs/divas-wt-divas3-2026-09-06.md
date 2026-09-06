# Handoff — divas — wt-divas3 — 2026-09-06

**Branch** `wt-core` at `06d5c290`. Lane `wt-divas3`. Pushed: yes.

This session was pinned to `wt-core` rather than to `wt-divas3` — the lane's own
work had already been integrated, and everything below is trunk work: applying a
migration, and driving PR #43 (`wt-core` → `wt-web`) to green. Filed under
`wt-divas3` because that is `git config sahoda.lane` and because
`divas-wt-core-2026-09-05.md` belongs to a DIFFERENT session running Fable 5.1
on the same branch at the same time. Two agents were on `wt-core` all evening.

## What shipped

| What | Proof | Test |
| --- | --- | --- |
| `workspace_storage_bytes` applied to production and staging | `mcp__Supabase__list_migrations` shows `20260904090000` on `rloztdhzfliyvpvxsgjl`; applied to `yoxmzwkxweasfaahhvpj` this session | `packages/db/tests/workspace_storage_bytes.pglite.test.ts` — 8 passed, 5.36s, at `06d5c290` |
| The function returns a figure that matches a hand-written sum | MEASURED on production: workspace `8846b067`, `fn_bytes` 15,504,316 = `hand_bytes` 15,504,316 | same file, `adds up the library, the crops made from it, direct uploads and knowledge PDFs` |
| `anon` no longer holds EXECUTE on that definer function | `20260904120000_workspace_storage_bytes_revoke_anon.sql`, applied to both projects | grants read back `authenticated, postgres, service_role` on both |
| The js-budget baseline re-recorded, unblocking every `wt-core` deployment | `f4faf592`, `apps/web/scripts/perf/js-budget.json`, 83 routes | `node apps/web/scripts/perf/js-budget.mjs` — `js-budget ok: 83 routes within budget` at `06d5c290` |

## What was NOT done, and why

- **Playwright `@smoke` was not run by me — UNRUN here.** It cannot run in this
  sandbox: Chromium completes no outbound HTTPS request, and every @smoke spec
  signs in through Clerk. The other session ran it on a GitHub runner; its
  result is in the Gate section.
- **`wt-core` was NOT promoted to `wt-web`.** That is the one gated step and no
  person authorised it. PR #43 stays open.
- **The 4 kB the shared `(app)/layout` gained is recorded, not recovered.** The
  budget re-record locks it in. Nobody has investigated what added it.
- **I did not touch `.github/workflows/gate.yml`,** where the smoke leg's
  remaining problems live. The Fable session pushed four commits to that file
  during this session; a competing edit was the likelier harm.
- **`pnpm gate` was not run end to end locally.** The legs I ran are named below;
  CI ran the full unit leg green on four heads.

## Shared surfaces touched

**None.** No shared type, fixture, token or config changed. The two files this
session added are a SQL migration and a JSON baseline, and neither is imported
by any package.

The budget file is a shared *constraint* rather than a shared surface: a lane
that adds more than 8 kB to a route will now fail its Vercel build against the
new figures, which is the intended behaviour.

## Contract, migration or money

**Two migrations, both APPLIED to production and staging** (`supabase db push`
is a founder action; the founder said "apply the migration"):

| Migration | Projects | What it does |
| --- | --- | --- |
| `20260904090000_workspace_storage_bytes.sql` | production (already applied by an earlier session), staging (applied here) | adds the definer function behind the Storage panel and the 1 GB refusal |
| `20260904120000_workspace_storage_bytes_revoke_anon.sql` | both | `revoke execute … from anon` |

No price, no ledger, no `packages/shared` change.

**Why the second migration exists, because it is a trap another table will hit.**
`20260904090000` ends `revoke all on function … from public` and believed that
left only `authenticated`. MEASURED on both live projects after it applied, the
EXECUTE grantees were `service_role, authenticated, anon, postgres`. Supabase
ships an `alter default privileges` granting EXECUTE on every new function in
`public` to those three roles **individually**, and revoking the `PUBLIC`
pseudo-role does not touch an individual grant. The PGlite guard asserts
`not.toContain('PUBLIC')` and passes, because PGlite has no such default
privilege to reproduce. **Any future `security definer` function in this schema
has the same hole unless it revokes from `anon` by name.**

## Guards written, and the mutation that proved each

| Guard | Mutation applied | What went red |
| --- | --- | --- |
| `js-budget` still fails on a real regression after the re-record | lowered `/(app)/planner` by 9 kB in `js-budget.json` | `js-budget FAILED — 1 route(s): /(app)/planner 792.4 kB > 783.4 kB budget +8 kB slack (+9.0 kB)`, exit 1; restoring the file exits 0 across all 83 |
| The `anon` revoke actually closed the door | called the function as `anon` before and after | before: `42501 not a member of this workspace` (the function's own predicate); after: `42501 permission denied for function workspace_storage_bytes`. The wall MOVED, which is the proof — and an authenticated member still reads 15,504,316 |

No new test file was written this session. A PGlite assertion that `anon` lacks
EXECUTE would pass vacuously — PGlite never grants it — and a guard that cannot
fail is not a guard, so the proof is the live before/after above and is recorded
in the migration's header instead.

## Anything retracted

**`CLAUDE.md`'s claim that the smoke job has never passed its secrets guard is
now false.** It says "No repository secrets are configured at all … every 'run it
in CI' instruction written here has been unexecutable since the workflow landed."
MEASURED 2026-09-05: run 33985674352 passed the guard, installed Chromium, built
the app and ran the suite for 57m48s against staging. Six E2E secrets exist. I
did not edit `CLAUDE.md` — the file is being rewritten by the other session on
this branch and an edit would have collided.

**The claim that `pnpm --filter @sahoda/db test` is green here is also false, and
was not mine to fix.** `tests/live-guard.test.ts` fails in this sandbox because
`scripts/cloud-setup.sh` writes a `.env` carrying `SUPABASE_DB_URL`, which the
guard exists to refuse. MEASURED: it fails identically at `07b4a38d`, before any
change of mine. `.env` is on the do-not-touch list.

## What the next session in THIS lane should pick up

1. **Read `divas-wt-core-2026-09-05.md` first.** The Fable session's record of
   the smoke leg is more complete than anything here, and it owns that work.
2. **The smoke suite does not fit in its job budget.** 57m48s against a
   60-minute limit, cancelled with no verdict. Sharding or a 90-minute limit is
   the open question; the run's own numbers are in the other handoff.
3. **The job log contains ZERO Playwright output.** MEASURED on run
   33985674352: it goes from `@sahoda/jobs:typecheck` at 19:00:47 straight to
   `The operation was canceled` at 19:58:27. `pnpm turbo run test:smoke` buffers
   a task's output until the task ends, so a cancelled run says nothing at all
   and every verdict so far has had to be reconstructed from a 210 MB artifact.
   Streaming that output is a one-line change and turns silence into "it died
   here".
4. **Somebody is retrying a production promotion that cannot succeed.** Two
   production-target redeploys at 20:35 and 20:50 UTC, both of the stale commit
   `d0eab964`, both dead on the js-budget guard that `f4faf592` fixed.
   Redeploying that commit will fail forever; promotion must come from the
   current head.
5. **The `(app)/layout` +4 kB.** Unexplained, now baked into the baseline.

## Gate

Run at `06d5c290` unless stated. Not piped.

| Leg | Command | Result |
| --- | --- | --- |
| Build + js-budget | `pnpm run build` in `apps/web` | **PASS** — `js-budget ok: 83 routes within budget` |
| Storage migration | `vitest run tests/workspace_storage_bytes.pglite.test.ts` | **PASS** — 8 passed, 5.36s |
| Format | `npx prettier --check .` | **PASS** — "All matched files use Prettier code style!" |
| `packages/db` full | `pnpm --filter @sahoda/db test` (at `cff2231b`) | **FAIL, environment** — 977 passed, 1 failed, 198 skipped. The one is `live-guard.test.ts`, which fails identically at `07b4a38d`; see Anything retracted |
| Unit gate, CI | `typecheck · lint · test · format`, job 101389608721 | **PASS**, 23:01 UTC on `b730f1e0` — green on four consecutive heads |
| Playwright `@smoke`, local | — | **UNRUN.** Chromium here completes no outbound HTTPS |
| Playwright `@smoke`, CI | run 33985674352 | **NO VERDICT.** Ran 57m48s on `1a4f8fd5`, cancelled at the 60-minute limit. 24 failures in five groups read from the artifact by the other session; the largest group, the 390 px topbar overflow, is fixed at `b730f1e0` |
| Vercel, branch preview | `dpl_ADzy3ztaWfXi3vtvWvts4HYN4ye9` | **READY** on `b730f1e0`, after eight consecutive red builds on the two budget routes |
