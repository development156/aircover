# Handoff — divas — wt-divas2 — 2026-09-06

**Branch** `merge-k2-into-core` at `e51664df`. Lane `wt-divas2`. Pushed: **yes, to
`wt-core`** — not to the lane, which is untouched at `c8c7e641`.

This session wrote no feature code. It was an OPERATIONS session: it got the
Playwright smoke leg from "cannot start" to "starts and reports real failures",
and it merged another lane's PR into the trunk.

In plain terms: the automated browser tests had never once run in five sessions.
They now run. Along the way the shared branch's website started building again
after a long run of failures, and my merge was the first build that worked.

## What shipped

| What | Proof |
| --- | --- |
| PR #45 merged into `wt-core` | `merged: true`, `merged_at 2026-09-05T18:32:43Z`, `merged_by development156`. GitHub recorded a real merge, not a manual close. |
| The merge itself, one conflict resolved | `6735e476`. Conflict was `apps/web/scripts/perf/js-budget.json` alone; resolved to `wt-core`'s side. |
| The Undo wait's sibling, which `00ef8381` missed | `ab386183`, `apps/web/src/components/assets/asset-library.test.tsx:257`. Covered by the test it lives in, `bulk filing > states the real added/alreadyThere counts, and Undo calls the inverse action`. |
| Trunk merged back in before pushing | `e51664df`, zero conflicts across `wt-core`'s three newer commits. |
| Both are on the trunk | `git merge-base --is-ancestor` returns YES for `e51664df` and for `ab386183` against `origin/wt-core`. |
| The first `wt-core` Vercel build to go READY after the failures | `dpl_GVEc4fQXC1NsBQLxWD8dfTbzUC8q`, state **READY**. Eleven `wt-core` builds since are all READY. |
| The six GitHub repository secrets are readable by CI | run 1397, job `Playwright @smoke`, step `Refuse without the keys the suite needs`: **success at 12:10:52**. Every prior run exited 1 there. |

**MEASURED.** The smoke guard had refused on three earlier runs (981, 1061, and
every attempt before today) naming the same three absent names. It passed for the
first time today once the founder added the six secrets.

## What was NOT done, and why

- **Playwright `@smoke` is still not PASSED, and it is no longer UNRUN either.**
  It now runs and fails. `b338857d` on the trunk records **24 failures in five
  groups** from another session's run. I did not run it myself on this tree and I
  did not read those 24 failures.
- **I did not diagnose the smoke failures.** Two runs I dispatched (1406 and
  1409) each burned their whole job limit with no verdict. Another session pulled
  the traces and found the cause before I did; details under Anything retracted.
- **I did not open the preview in a browser.** The build is READY and the URL is
  at the bottom of this file, but no screen on it has been looked at by me.
- **I did not promote `wt-core` to `wt-web`.** Production last built from
  `d0eab964`, which **errored**, so the live site carries none of today's work.
  That promotion is the one gated step in this system and it is the founder's call.
- **I did not touch production data.** Two hour-long smoke runs minted dozens of
  Clerk test users and wrote **0 rows** to staging and 0 to production. I queried
  `workspaces`, `users_profile` and `credit_ledger` on both, three times.
- **I did not fix the four production-only tables.** MEASURED: `brands`,
  `elements`, `jobs` and `ledger` exist on `rloztdhzfliyvpvxsgjl` and are created
  by **no migration in the set**. That is pre-migration drift on production, not
  a gap in staging, and it is somebody's decision rather than mine.
- **I did not delete staging's duplicate migration row.** `signup_grant_per_user`
  is recorded twice, which is why staging reads 107 against 106 files. The ledger
  is keyed on version so both rows are valid and the schema is correct. Deleting
  a history row for cosmetics is not worth the risk.

## Shared surfaces touched

**One, and it is another lane's file rather than mine.**

`apps/web/src/components/assets/asset-library.test.tsx` — the `bulk filing`
Undo test gained a 20s test budget and a 15s `waitFor`, matching the sibling at
line 835 that `00ef8381` had already raised. **Nothing is required of any
caller**: this is a test file, no export changed, no constructor breaks. Any lane
that merges trunk simply gets a test that no longer fails under load.

`apps/web/scripts/perf/js-budget.json` was in the merge as a CONFLICT but is
**byte-identical to `wt-core`'s version** — `git diff origin/wt-core` on that path
returned nothing. So no lane inherits a budget figure from me.

The surfaces this lane moved on 2026-09-03 are unchanged and recorded in
`divas-wt-divas2-2026-09-03.md`.

## Contract, migration or money

**No migration written and none applied by me.** No price touched. No ledger
change. Nothing in `packages/shared`.

**MEASURED on staging `yoxmzwkxweasfaahhvpj`**, which I verified rather than
trusting a count: all **106** of the repository's migrations applied, none
missing after a name-by-name diff; **84** tables, **84 with RLS on and 0 off**;
buckets `brand-assets`, `media`, `qa-artifacts`; `plans` seeded with 4 rows;
**0 workspaces**, so no customer data. The founder asked me to apply the
migrations and the honest answer was that there was nothing to apply.

## Guards written, and the mutation that proved each

**One, and its mutation went red where its sibling's could not.**

`asset-library.test.tsx:257`. Mutation: `toHaveBeenCalledWith('f1', ['a'])` →
`['a','b']`. **Grepped at line 257 to prove the mutation landed** before running,
because an absent symbol is not a mutation. Result: **1 failed of 34**, and it
took **22.8s** rather than 7.6s because the assertion now waits its full 15s
before giving up. Restored → **34 of 34 in 7.6s**.

That single mutation proves two things: the longer timeout is genuinely in
effect, and the claim is intact — Undo must still remove only what this action
added, never the filing that already existed.

**The timeout itself is NOT mutation-proved**, for the reason `00ef8381` records
about its sibling: on an idle machine the call has already happened before
`waitFor`'s first check, so shrinking it does not turn the test red here. That
sentence is in the file, not only in the commit message. If it goes red at 15s,
the next reader should suspect a real race in the Undo handler.

## Anything retracted

- **I told the founder to open `https://app.sahodalabs.com/api/cron/sweeps` in a
  browser. That was wrong.** MEASURED at `apps/web/src/app/api/cron/sweeps/route.ts:112-119`:
  the first statement in the handler compares an `Authorization: Bearer` header
  against `CRON_SECRET` and returns 401. A browser sends no such header, so
  "Unauthorized" was the route working. The report should have been Vercel's
  logs or a curl with the header.
- **The `wt-core` preview URL I gave in the 2026-09-04 handoff pointed at builds
  that had FAILED.** MEASURED: `69ed119e` records seven consecutive `wt-core`
  deployments in ERROR, three of them production promotions. My handoff ended
  with that URL and named nine screens to look at. `wt-girija`'s `d319d778`
  records the identical error from its own session: `pnpm gate` aborts at the
  smoke leg and prints `turbo-build` as NOT RUN, so a "green gate" omits
  `next build` and the `js-budget` guard inside it entirely.
- **My dev-server reading of the smoke timeout was incomplete, and the second
  run disproved it.** Another session diagnosed run 1406 as running on `pnpm dev`
  and pushed a build-then-`next start` fix. Run 1409 on that fix ran **57m39s and
  was cancelled by the 60-minute limit** with no verdict, exactly as before. The
  real cause came from the uploaded traces and is recorded in `571d3259`: every
  spec failed on `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL`,
  because `E2E_SUPABASE_URL` held a value that was not an https address. 34 Clerk
  users leaked and were purged.
- **The budget fix I merged was already redundant when I merged it.** `wt-core`
  landed `f4faf592`, re-recording all 83 routes, while I was writing the previous
  report. That is why the merge conflicted at all.
- **I marked PR #45 ready for review to merge it.** It was another session's
  draft. A draft cannot be merged, and the founder asked for the merge.

## What the next session in THIS lane should pick up

**This lane is 35 commits behind trunk and holds no work of its own.** Pull
before anything: `git fetch --all --prune`, then check the merge-base rather than
assuming divergence.

1. **The 24 smoke failures in five groups** (`b338857d`). The suite finally
   produces a real result and nobody has worked through it. This is the highest
   value thing available and it did not exist as an option before today.
2. **Open `/sites` on a real workspace and delete a website.** Still the one
   destructive control this lane added that has never run against a real
   database. Carried from `divas-wt-divas2-2026-09-04.md`, still true.
3. **The four production-only tables** — `brands`, `elements`, `jobs`, `ledger`.
   Decide whether they are dead or whether a migration is missing.
4. **`wt-core` → `wt-web`.** Production has not taken any of the last two days'
   work and its last build errored.
5. **Two commits dropped by the 2026-09-03 trunk rewrite are still not
   re-landed**: `ebe5828e feat(autopilot): the audit trail` and `aa2ec867
   docs(38): the tenant-table count`. Carried forward unresolved for a third day.

## Gate

MEASURED 2026-09-06 on `merge-k2-into-core` at `e51664df`, which is the exact
commit pushed to `wt-core`. `--force` on the turbo leg, not piped, each leg's
exit code captured separately.

| Leg | Result |
| --- | --- |
| `turbo run typecheck lint test --force` | **PASS — 27 of 27 tasks**, 9m55s |
| root `vitest` | **PASS — 262 passed, 18 files** |
| `prettier --check .` | **PASS** |
| Playwright `@smoke` | **NOT RUN on this tree.** Runs elsewhere; 24 failures reported by another session on a later trunk commit. |

The `@sahoda/web` leg is the one worth naming: it went **red once** on this tree
before `ab386183` (1 failed of 8,427, `asset-library` Undo) and green after. That
failure is the reason this session wrote a guard at all.

**Look at it:** https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app

That is the trunk preview and it is **trustworthy again as of this session** —
`e51664df` was the first READY build after the ERROR run, and eleven `wt-core`
builds since are all READY. It is **not** https://app.sahodalabs.com, which last
built from `d0eab964` and **errored**, so nothing here has reached customers.
