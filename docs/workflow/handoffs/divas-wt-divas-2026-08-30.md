# Handoff — divas — wt-divas — 2026-08-30

**Branch** `wt-divas` at `51436a23`. Lane `wt-divas`. Pushed: **yes**. Open on
**PR #28**, base `wt-core`, draft, CI green (11:41:42Z to 11:49:38Z). **Not
merged.**

**This lane's preview:**
<https://sahodalabs-git-wt-divas-development-4417s-projects.vercel.app/loop>
**Live:** not promoted. Nothing in this lane has reached production.

**Autopilot — L3, the level that publishes with nobody watching — is built,
wired, scheduled, monitored, and switched off.** One environment variable stands
between this code and unattended publishing, and it is set nowhere.

---

## The one thing to read before anything else

Autopilot used to be held back by four things. **Three of them were never
safeguards.**

| Held it back | What it actually was |
| ------------ | -------------------- |
| the refusal gate was a stub returning `hold` | unfinished work |
| the cron was not in `vercel.json` | unfinished work |
| `AutonomyLevelSchema` was `union(0,1,2)` | unfinished work |
| `SAHODA_AUTOPILOT_ENABLED` absent everywhere | **an actual decision** |

Every one of the first three was described in a file header as a deliberate
gate. They were incompleteness wearing a safeguard's clothes, and writing that
down is dangerous, because the next reader believes it. This lane removed all
three on purpose and left the fourth.

**What holds now:** the flag, plus the trigger in
`20260828120000_loop_autopilot_l3.sql`, which refuses level 3 to any workspace
without a supervised cycle that reached `reported` and a Brand Brain with four
fields confirmed. That is a rule about rows, enforced by the database, and it
cannot be talked past by application code.

---

## What shipped

Fourteen commits from `2d98b424` back through the session, then the three that
finish it.

| # | What | Where |
| - | ---- | ----- |
| 1 | The decision core: six guardrails, ordered by permanence | `lib/loop/autopilot/decide.ts` |
| 2 | Phase two: which announced posts may still go out | `dispatch-due.ts` |
| 3 | Twelve statements, in a module a real Postgres executes | `sql.ts` |
| 4 | The reads and writes | `store.ts`, `row-mappers.ts`, `decision-params.ts` |
| 5 | One tick, and the fleet tick | `run.ts`, `tick.ts`, `tick-all.ts` |
| 6 | The kill switch, and the seam that made it lie | `actions/autopilot-stop.ts` |
| 7 | What autopilot did, in a sentence claiming only what we saw | `history-copy.ts` |
| 8 | What is set to go out, on the Loop screen | `components/loop/going-out.tsx` |
| 9 | The flag, the route, the schedule, the heartbeat | `cron/autopilot-enabled.ts`, `api/cron/autopilot/route.ts` |
| 10 | The real gate, wired | `tick-all.ts` |
| 11 | L3 storable, and its three refusals as sentences | `packages/shared/src/db/loop.ts`, `lib/loop/autopilot-refusal-copy.ts` |

**308 tests** across 21 unit suites and one pglite suite. **69 mutations**
applied, run, and watched go red, each listed in the commit that introduced it.

---

## Three decisions the next session should not undo without reading

**Autopilot does not publish. It schedules.** `armForPublish` sets
`status = 'scheduled'` with a real `scheduled_at`, and the existing sweep
publishes through the Constraint Engine, the refusal gate and
`assert_account_for_scheduled_post`. This is why the kill switch reaches
autopilot with no new code, and why `dispatched` is never a claim about a
platform.

**The gate runs twice per post, and both are true.** Once at announce time here,
once at send time in `runPublishPost`. The body can change between them, the
publish-time one remains the real boundary, and this one exists so the autopilot
log can say `REFUSAL_GATE` and mean it rather than announcing something the
publish path was always going to refuse. Two `gate_audit` rows per post is
correct, not duplication to remove.

**The tick period is set by the cancel window, not by how often there is work.**
Ten minutes. A customer is promised minutes to change their mind; an hourly tick
would let a post sit past a five-minute window for fifty-five minutes and then
send it, the promise broken by the schedule rather than by any code.

---

## The real bug the guards caught

The cron route was scheduled and **not exempt from Clerk**. Every tick would
have been a 307 to `/sign-in`, which the heartbeat would have recorded as a
healthy run, while a customer who armed a channel watched nothing happen and got
no explanation. **Four separate set-guards across three files went red** —
`wiring.test.ts`, `middleware.test.ts` (twice) and `middleware.coverage.test.ts`.
The exemption is now in `isPublicRoute` and in **both** middleware matchers.

---

## Four seams, and the defect that found them

The kill switch shipped a defect: cancelling returned a refusal named
`CANCELLED`, whose copy said the person had stopped it, so autopilot's own stop
read as theirs. Three guards each covered their own half and none covered the
seam. Three more instances of that shape were then hunted down:

| Seam | Now |
| ---- | --- |
| columns the SQL returns vs fields the decisions read | `row-mappers.ts`, a leaf module the pglite suite feeds real rows |
| the ten positional arguments of the decision write | `decision-params.ts`, used by both sides, every column read back |
| argument counts at the other eleven call sites | `param-arity.test.ts`, which says plainly it cannot see a swap |

A fourth appeared in this lane's own UI work: the Loop page returned `null` when
the going-out read failed, so a reader whose read had failed saw a screen
identical to one where autopilot had nothing pending. Caught by turning the
component's own "present in every state" rule on the page.

---

## Guards retargeted, never deleted

Four guards asserted things that were true and became false. CLAUDE.md's fifth
copy rule says retarget, and in each case the claim survived and inverted.

| Guard | Asserted | Now asserts |
| ----- | -------- | ----------- |
| three in `autonomy-dial.test.tsx` | L3 is not a control | L3 is a **real** control, never a disabled one |
| one in `tick-all.test.ts` | the route is not in `vercel.json` | the schedule brought a heartbeat, and the flag is the only gate left |

What they always protected: **a screen must not offer a control that leads
nowhere**, and **a scheduled job is a monitored job**.

---

## Contract, migration or money

**One contract change**, and the PR title carries `[contract]`:
`AutonomyLevelSchema` now admits 3, and `AUTONOMY_LEVELS` marks L3 `storable`.
`DEFAULT_AUTONOMY_LEVEL` is still 1 — nothing is armed by upgrading, and a test
pins that because it is the one mistake here a later deploy cannot undo.

Opening the union was **half** a change. Its own header warned that admitting a
3 would let a value reach the column and return as a raw constraint violation.
The other half is `lib/loop/autopilot-refusal-copy.ts`: all three named
refusals become sentences that say what is missing, and none prints the internal
field paths Postgres appends. It lives outside the server action because a
`'use server'` module may export only async functions —
`use-server-exports.test.ts` catches that before `next build` does.

**No migration was written and none was applied.** `20260828120000` was already
in the tree. **No price touched, no ledger write.** Publishing costs nothing, so
the `WEEKLY_BUDGET` guardrail cannot fire today; that is written into
`verdicts.ts` and pinned by a test asserting the zero.

---

## Anything retracted

**Yes, twice, and both were mine.**

The earlier diagnosis that the smoke leg fails on Chromium transport resets is
**retracted**. That was measured for Chromium, and this leg never gets that far:
it fails in `e2e/global-setup.ts` at `clerkSetup()` in 35 seconds, before any
spec runs. MEASURED: the same key returns 200 from plain Node in the same
sandbox. **Which response the SDK received is UNMEASURED.**

An `@sahoda/db#test` failure recorded earlier as unreproducible is **explained**:
`audit-catalog-gap.test.ts` was the only suite booting PGlite inside test bodies
(30s `testTimeout`) instead of `beforeAll` (60s `hookTimeout`), three times over.
It took 41.7s under turbo. Fixed to two boots, both in hooks.

---

## What was NOT done, and why

- **`SAHODA_AUTOPILOT_ENABLED` is set in no environment.** `.env*` is on the
  do-not-touch list, so a person must set it. This is the design, not an
  oversight: one deliberate human act between the code and unattended
  publishing.
- **The Playwright smoke suite has never run on a runner for this branch.** It
  cannot reach a browser in this sandbox. Dispatch the `smoke` job on
  `gate.yml` by hand, with the project ref typed in, before merging. **It writes
  to the one production Supabase project**, which is why it is a deliberate act
  and why I did not perform it.
- **No end-to-end announce-then-publish run has ever happened.** Both halves are
  tested separately; nothing has gone through both together, because until this
  PR nothing could arm a channel.
- **PR #28 is unmerged**, and I did not merge it.
- **`packages/db` migrations untouched.** Only `wt-db` edits those.

---

## Shared surfaces touched

`packages/shared/src/db/loop.ts` (the contract), `apps/web/src/middleware.ts`
(one public path, both matchers), `apps/web/vercel.json` (one cron),
`apps/web/src/lib/cron/heartbeat.ts` (one `CronJob`, one schedule),
`apps/web/src/app/(app)/loop/page.tsx` (one section mounted).

**`wt-core` was merged in eleven times** while this was open, bringing another
session's Brand Skin work (`lib/brand/*`, `components/shell/*`). It is in the
diff and is not mine.

---

## Gate

MEASURED on `51436a23`, clean tree, each leg forced.

| Leg | Result |
| --- | ------ |
| `turbo typecheck lint test` | **PASS** — 27/27, `Cached: 0`; web 6,439, db 798, shared 519 |
| `vitest` root | **PASS** — 223 |
| `prettier --check .` | **PASS** |
| CI `typecheck · lint · test · format` | **PASS** on `51436a23` |
| `turbo test:smoke` | **NOT RUN** — see above |

---

## What the next session in THIS lane should pick up

1. **Dispatch the `smoke` job** on a runner before anyone merges #28.
2. **Merge #28 into `wt-core`.** Nothing about it changes behaviour while the
   flag is unset.
3. **Only then**, and only on the founder's word, set
   `SAHODA_AUTOPILOT_ENABLED=true` in a **preview** environment and walk one
   workspace through arming a channel. Expect the trigger to refuse unless that
   workspace has a reported cycle and a confirmed Brain — that refusal is the
   feature working, and its sentence is in `autopilot-refusal-copy.ts`.
4. **Watch `gate_audit` and `loop_autopilot_log` on the first real tick.** The
   gate writes a row per check and this path checks twice per post.
5. Do **not** promote `wt-core` to `wt-web` on the strength of this lane's tests
   alone. No post has ever gone out through this path.
