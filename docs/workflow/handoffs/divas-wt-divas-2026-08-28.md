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

**The @smoke leg has NOT been run on this lane.** No screen in this work was seen
render. `verdict.test.ts` and `controls.test.tsx` prove the sentence and the link
in a DOM; they do not prove the page assembles them.

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

1. **Run the @smoke leg**, with `node scripts/browser-run.mjs --grep @smoke`.
   Nothing in this work has been seen render.
2. **Resolve the wt-core merge** — two script files, both sides real.
3. **The founder's four items**, now written up as section 15 of
   `docs/25_Founder_Actions.md`: apply the migration, confirm
   `SAHODA_LOOP_CRON_MODE=on` in Vercel, get the fix onto the branch the
   schedule runs from, and resume workspace `6473b616`, which has two live
   channels, a resolved brain and 1,196 credits and needs one click.
4. **Phase 2 (L3 autopilot) is NOT started**, by design: the document says to
   read Phase 1's report first.
