# Handoff — divas — wt-divas — 2026-08-28

**Branch** `claude/advisor-qvz5wn`, pushed. Lane `wt-divas`. PR
[#20](https://github.com/development156/sahodalabs/pull/20), draft, into
`wt-core`. Base was `55942f66`; seven commits added.

The session's task was **Phase 1 of `LOOP_BUILD_1.md`** — make the Loop work for
a real customer. The build document is substantially STALE against the tree, and
the single most important thing here is a defect it does not mention.

## The answer first

**The Sunday cron could not run at all, and nothing was watching.** Its one query
read `from loop_autonomy d`; the table is `loop_channel_autonomy`. MEASURED
against production by running the fragment verbatim:
`ERROR: 42P01: relation "loop_autonomy" does not exist`.

Whether the schedule fired is NOT observable from here — the heartbeat is in
Redis, not the database — so "every tick failed" is INFERRED, not measured. What
is measured: the newest cycle in production started **2026-08-23 10:31 UTC**, and
the commit that broke the query landed **11:55 UTC the same day**. Nothing has
been planned since, and the last thing that worked did so 84 minutes before the
break.

The commit that introduced it, `3aa6186d` on 23 August, is the one whose whole
purpose was to make the Loop say why it will not plan for you.

## What shipped

| # | What | Commit | Proved by |
|---|---|---|---|
| 1 | The cron's query fixed, and moved where a test can run it against every real migration | `ee918763` | `loop-facts-sql.pglite.test.ts`, 5 tests |
| 2 | /loop says why it will not plan, with a remedy that works | `a493abf7` | `verdict.test.ts` 13, `controls.test.tsx` 4 |
| 3 | `brain_not_resolved` as a reason, and an unconfirmed brain as an advisory | `4ac24f82` | `verdict.test.ts`, `confirmed-count.test.ts` 5 |
| 4 | Reflect gets a floor measured in DAYS, and the reason reaches the reader | `3ea6a328` | `reflect.test.ts` 19, `store-reflect-reason.test.ts` 4 |
| 5 | All six cron routes checked for the two shapes that take a database down | `d1fe7f0d` | `route-shape.test.ts` 25 |
| 6 | A cycle's learnings were filtered AFTER a limit of 20, so they went missing | `2e50043e` | `report.test.ts` 8 |
| 7 | Six eligibility sentences lose their em dashes now they reach a screen | `860c036f` | 11 pinned assertions retargeted |

Every one was proven by mutation. The mutations and which test each turned red
are in the commit messages, one section per commit.

## What the build document says that is no longer true

| The document says | MEASURED truth |
|---|---|
| "`/api/cron/loop` has no `maxDuration`" | It has `maxDuration = 300` at route.ts:61, plus a deadline and a `deferred` count. All six cron routes have one |
| "It leaks a pg Pool per workspace" | One pool for the tick, closed in a `finally`. Fixed in `3aa6186d` |
| "the metrics cron's permanent starvation past 120 targets" | Fixed, ordered least-recently-measured first, and already proven above the threshold at `store.pglite.test.ts:377` |
| "Eligibility is a list of reasons" — described as unbuilt | Six of the seven reasons existed. Only `brain_not_resolved` was missing |
| "`/report` is a designed coming-soon screen" | It renders real data from real queries |
| "Two workspaces have ever opened the Loop" | Five have, as of 28 August |
| "1,260 credits" on the paused workspace | 1,196 |

## What was NOT done, and why

**No full cycle was run end to end.** It cannot be run from this sandbox: live
suites require `SAHODA_ALLOW_LIVE_TESTS=1` AND must pass
`assertTargetIsNotProduction`, which refuses the ref `rloztdhzfliyvpvxsgjl` by
substring, and production is the only database this environment can reach. That
guard is correct and was not worked around. Three of the six proofs the document
asks for already exist in gate-runnable pglite tests: the forced halt
(`loop_migrations.pglite.test.ts`, "still refuses when the status was forced to
creating without an approval"), the kill switch with a hand-scheduled
`origin='plan_week'` post SURVIVING, and the ledger invariants.

**The ledger invariants were run against production instead**, through the
Supabase MCP: **9 of 9 hold, zero violations**, 28 August. Not before-and-after a
cycle, because no cycle was run.

**The migration is written and NOT applied.** `20260828100000_loop_reflect_reason.sql`.
`db push` is a founder action. `setCycleStatus` retries without the column on
42703, so an unapplied migration costs the sentence and never the cycle stage —
and that fallback has its own test, including one that proves it does not swallow
any other database error.

**L3 was left exactly as it is.** The document asks for it visible and
unselectable; it is already a locked `<div>` in the ladder, never a disabled
button, with a component test asserting all three claims. It sits inside a
`<details>`, which a peer flagged as "not visible without an interaction" — that
is a design call on a shared screen and belongs to the design lane, not to a
one-line change here.

**The @smoke leg RAN on this lane, and it is the first time.** It is not clean,
and the failures are not this lane's. What was measured:

| run | result |
|---|---|
| `browser-run.mjs --grep @smoke` against `next dev` | 66 passed before I stopped it at ~70 of 118; ~21 distinct specs failing |
| the same three failing specs against a production `next start` | still 9 failed, so the dev server was NOT the cause. The hypothesis was tested rather than asserted |
| `no-impossible-remedy` + `roadmap-honesty` against `next start` | **33 passed, 0 failed** |

That last run is the one that matters here: **`/loop offers no remedy it cannot
fulfil` PASSES**, in a browser, as a fresh account, which is the guard that
adjudicates the new copy. `/report` passes the same guard, and
`roadmap-honesty` confirms no invented number reaches either screen.

The failures group by CAUSE, not by count. One read in full:
`net::ERR_CONNECTION_RESET at http://127.0.0.1:3210/design-system` — a transport
reset on a plain loopback URL, not an assertion about the product. Every failing
spec is contrast, greyscale or screenshot-heavy: `auth-contrast`,
`design-system`, `audience-layers`, `accent-budget`, `composer-widths`,
`every-section-loads`. None is a spec this lane touched, and the specs that DO
walk /loop pass. Whether they fail anywhere else is UNKNOWN from here; CLAUDE.md
records the last full run as 2026-08-24, 115 passed.

**No screen in this work was seen render by a person.** The browser proves the
guards, not the look.

**The unresolved `wt-core` merge from kickoff is still unresolved.**
`scripts/browser-run.mjs` and `scripts/sandbox-probe.mjs` conflict — wt-core's
`127b29c4` installed a browser, this lane's `2be1316b` taught the probe to see
one. Both are real. Aborted rather than picked.

## Shared surfaces touched

`lib/loop/eligibility.ts` (new reason, new advisory, `remedy()`, six sentences
rewritten), `lib/loop/read.ts` (two new snapshot fields plus a brain read, and
`credit_balances` and `brand_memory` join the error check), `lib/loop/store.ts`
(`setCycleStatus` gained a parameter and a fallback), `lib/loop/reflect.ts` (a
fifth gate and a sixth reason), `components/loop/controls.tsx` (a new prop),
`lib/cron/run-loop.ts` (the SQL moved out), and one new migration.

Anything merging on top of these should re-run `src/lib/loop` and `src/lib/cron`
together — the LoopFacts type change breaks fixtures loudly, which is the type
system doing its job rather than a hazard.

## What the next session should pick up

1. **Find out whether the ~21 visual specs fail anywhere but here.** They reset
   on loopback in this sandbox on both a dev and a production server. Dispatch
   the `smoke` job on `gate.yml` by hand and compare. Do NOT assume they are
   this lane's, and do not assume they are not.
2. **Resolve the wt-core merge** — two script files, both sides real.
3. **The founder's four items**, now written up as section 15 of
   `docs/25_Founder_Actions.md`: apply the migration, confirm
   `SAHODA_LOOP_CRON_MODE=on` in Vercel, get the fix onto the branch the
   schedule runs from, and resume workspace `6473b616`, which has two live
   channels, a resolved brain and 1,196 credits and needs one click.
4. **Phase 2 (L3 autopilot) is NOT started**, by design: the document says to
   read Phase 1's report first.

---

# Session 2

**Branch** `claude/advisor-qvz5wn` at `ebe5828e`. Lane `wt-divas`. Pushed: **yes**.
PR [#20](https://github.com/development156/sahodalabs/pull/20), draft, into
`wt-core`, `mergeable_state: unstable` (merges cleanly; only the starved CI
check is red). Zero behind `origin/wt-core`.

Session 1 above delivered Phase 1 of `LOOP_BUILD_1.md`. This session resolved
the `wt-core` merge that Session 1 left open, then built **Phase 2 parts 1 and
2**. Parts 3 to 6 are NOT built and the reason is structural, not time.

## What shipped

| # | What | Proof | Covered by |
|---|---|---|---|
| 1 | The `wt-core` merge, keeping BOTH lanes' fixes to the probe rather than picking one | `7fa1956e` | probe re-run MEASURED: "browser binary present — scan chromium-1228/chrome-linux", no install fired |
| 2 | L3 is storable, and only under two preconditions enforced by a trigger | `10ab12c1`, `20260828120000_loop_autopilot_l3.sql` | `loop_autopilot_l3.pglite.test.ts`, 18 tests |
| 3 | `autopilot_daily_cap` (default 3) and `autopilot_cancel_minutes` (default 30, floor 5) | same migration | same file, 4 of those 18 |
| 4 | The autopilot audit trail, every row naming what it acted on | `ebe5828e`, `20260828130000_loop_autopilot_log.sql` | `loop_autopilot_log.pglite.test.ts`, 12 tests |
| 5 | "Invented" and "written but not applied" split apart in the export drift check | `ebe5828e`, `lib/privacy/pending-tables.ts` | `pending-tables.test.ts`, 8 tests |
| 6 | The never-list as names a row can carry | `lib/loop/autopilot-refusals.ts` | adjudicated against the migration; **nothing writes them yet** |

**The cross-tenant guard was VERIFIED before anything was built on it**, which
is what the build document demands. Five hostile calls against production, five
distinct refusals: `CROSS_TENANT_ACCOUNT` (a well-formed foreign account),
`INVALID_VARIANT` (another workspace's variant spliced onto this post),
`INVALID_ACCOUNT` (malformed id), `POST_NOT_PUBLISHABLE` (a draft),
`INVALID_POST` (nonexistent). MEASURED 2026-08-28. It is `STABLE` and
`prosecdef: false`, and it re-derives the workspace FROM the post.

## What was NOT done, and why

**Phase 2 parts 3, 4, 5 and 6 are not built, and it is not a time problem.** All
four need the autopilot DISPATCH PATH, which does not exist:

- **P3 undo** — there is nothing to unpublish, because nothing publishes.
- **P4 telling the person** — the announcement and cancel window are stored
  facts (`decision='announced'`, `dispatch_after`), and nothing writes them.
- **P5 kill switch under autopilot** — the existing kill switch is proven,
  including a hand-scheduled `origin='plan_week'` post surviving
  (`loop_migrations.pglite.test.ts`). Re-proving it "with autopilot armed"
  requires autopilot to arm something.
- **P6 the never-list enforced** — the names exist; no code writes one.
  `loop_autopilot_log.pglite.test.ts`'s own WHAT IT CANNOT SEE section says
  exactly this: a name present in both files and used by nothing would pass.

Building the dispatcher is the next piece and it is substantial.

**No real publish was executed**, per the document's one exception. Nothing in
this session reached an adapter.

**Three migrations are written and NOT applied**: `20260828100000` (Session 1),
`20260828120000` and `20260828130000`. `db push` is a founder action. Nothing in
the app can write level 3 yet, so no customer is reachable by any of it.

**The @smoke leg still fails and it is still not this lane's.** Same transport
resets Session 1 measured, re-measured this session: gate leg 3 FAILED in 21.2s.

**The brain floor is a product judgement I made.** The four fields come from
`BRAIN_FIELDS`' own priority order, and the argument is in
`autopilot-floor.ts`'s header. It has not been ruled on.

## Shared surfaces touched

| Surface | What changed | Who it breaks |
|---|---|---|
| `packages/db/supabase/migrations` | two new files, both additive | nobody until applied; `bootFullSchema()` applies them, so every pglite suite now runs against them |
| `packages/db/tests/rls_tenant_isolation.pglite.test.ts` | `loop_autopilot_log` added to `EXPECTED_GUARDED` | a lane adding another append-only table hits the same list, which is the design |
| `apps/web/src/lib/privacy/export-manifest.ts` | one entry added, and the header list | **READERS, not constructors** — `EXPORT_TABLES` gained a row; nothing's type changed |
| `apps/web/src/lib/privacy/export-drift.test.ts` | phantom check now splits invented from pending | a lane whose manifest entry has no migration still fails, which is the point |
| `docs/38_Data_Handling.md` | table row, and the count 52 → 53 | any lane adding a tenant table must move it again |
| `scripts/sandbox-probe.mjs`, `scripts/browser-run.mjs` | merge resolution, both lanes' behaviour kept | every lane that pulls `wt-core` |

`packages/shared` was **not** touched this session. `AutonomyLevelSchema` still
admits only 0, 1 and 2, deliberately: the database now permits 3 under
conditions, and the application does not yet. That asymmetry is the safe
direction and is stated in the migration.

## Contract, migration or money

Two additive migrations, no contract change, no price touched, no ledger write.

`loop_channel_autonomy.level`'s CHECK widened from `<= 2` to `<= 3`. That is the
only existing constraint relaxed anywhere in this branch, and the same file adds
the trigger that makes the new value conditional. A test asserts 4 is still
refused, so the ceiling moved by exactly one.

## Guards written, and the mutation that proved each

Every one was applied, run, and WATCHED go red.

| Guard | Mutation | What went red |
|---|---|---|
| The named brain floor | a COUNT floor (3 of 4) instead of the named set | "REFUSES L3 when only the red lines are unconfirmed" **alone**. This is the real defect reproduced: most-fields-confirmed publishes unattended with no red lines |
| Supervised cycle | supervision read as "a cycle finished", dropping the human | "REFUSES L3 when a cycle finished but no person approved its cost" **alone** |
| The trigger's reach | `before insert` only | "REFUSES an UPDATE to L3 as firmly as an INSERT" **alone** |
| Audit trail identifiers | `account_id text not null default ''` — the exact `ops_audit_log` shape | the empty-account test **alone** |
| Append-only | trigger removed | both mutation tests red, the other ten green |
| Pending/invented split | every absent manifest entry excused as pending | the two invented-table tests red — that allowance going bad |
| The migration scan | scan matches no files | the size guard fires, so an empty scan cannot excuse everything |

No two mutations hit the same test, so no guard here is hiding behind another —
the failure mode the build document warns about.

## Anything retracted

**`docs/38` said `ledger_actor_redactions` was the one table written and not
applied. That is retracted.** MEASURED 2026-08-28 by asking the catalog for both
names: it came back, `loop_autopilot_log` did not. It has been applied some time
since 2026-08-26. Production holds **52** workspace-owned tables and this
branch's migrations create **53**. Third revision that paragraph has gone stale,
which the corrected text now says.

**`ops_audit_log` is worse than the build document records.** It says 95% of
12,196 rows name nothing. MEASURED: **17,556 rows, 16,915 nameless, 96.3%**.

**Session 1's claim that the smoke failures might be the dev server is
retracted.** It was TESTED against a production `next start` build and the same
specs failed identically. The cause is a loopback transport reset
(`net::ERR_CONNECTION_RESET at http://127.0.0.1:3210/design-system`), not
on-demand compilation.

## What the next session in THIS lane should pick up

1. **Get a ruling on the brain floor** before building on it. Four named fields,
   argued in `autopilot-floor.ts`. It gates a feature that publishes unattended.
2. **Build the autopilot dispatcher.** It is the blocker for four of Phase 2's
   six parts. It must: read the per-channel dial, write `announced` with a
   `dispatch_after`, refuse with a NAMED reason from `AUTOPILOT_REFUSALS`, and
   reach the existing publish path — which already runs Constraint Engine →
   refusal gate → `assert_account_for_scheduled_post` → adapter, in that order
   (`runPublishPost.ts:597`). Guardrail 5 is therefore structurally true
   already; what is missing is the autopilot-specific checks in front of it.
3. **The founder's four items**, `docs/25_Founder_Actions.md` §15, plus the two
   new migrations.
4. **The @smoke transport resets.** Dispatch the `smoke` job on `gate.yml` by
   hand and compare. Do not assume either way.

## Gate

Run on `ebe5828e`, a clean tree, each leg's real output.

| Leg | Result | Evidence |
|---|---|---|
| `turbo-typecheck-lint-test` | **PASS** | 27/27 tasks, **`Cached: 0`**, 6m32.773s. Forced with `--force` because the gate's own run replayed it in 1.3s, which verifies nothing |
| `vitest-root` | **PASS** | 3.4s. Caught two of my files arriving as scanners without a blind-spot declaration; both now declare one |
| `turbo-smoke` | **FAIL** | 21.2s. The browser leg. Same transport resets as Session 1, re-measured against a production build and not caused by the dev server |
| `prettier-check` | **PASS** | 37.7s |
| `turbo-build` | **PASS** | 112.8s |

Package detail from the forced run: `@sahoda/web` **5,803 passed**, 13 skipped,
460 files; `@sahoda/db` **698 passed**, 207 skipped; `@sahoda/jobs` 396 passed;
`@sahoda/mesh` 191 passed.

**One discrepancy I did NOT explain.** `@sahoda/db` reports 698 passed and zero
failed under `turbo run test`, and a standalone
`pnpm --filter @sahoda/db exec vitest run` in this sandbox reports **1 failed**
— `live-guard.test.ts`, "does not read the repo-root .env while the flag is
absent". That failure reproduces on a CLEAN tree (MEASURED by stashing), so it
is not this lane's. Why the two invocations disagree is **UNMEASURED**: turbo's
`test` task declares `env: ["SAHODA_ALLOW_LIVE_TESTS"]` and `globalEnv: []`,
which is a plausible mechanism and is not the same thing as having checked.
