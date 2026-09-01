# Handoff — divas — wt-divas — 2026-09-01

**Branch** `wt-divas` at `0b240459` (+ the uncommitted x-ration fix below, committed
as part of this handoff). Lane `wt-divas`. Pushed: **yes**.

**Preview:** <https://sahodalabs-git-wt-divas-development-4417s-projects.vercel.app/loop>
**Live:** `wt-web` is at `3718bd31`, **49 commits behind `wt-core`**. Nothing in this
handoff is on <https://app.sahodalabs.com>.

**Note on dates.** This session began on 2026-08-31 UTC and crossed midnight.
`docs/workflow/handoffs/divas-wt-divas-2026-08-31.md` is an earlier, partially
structured record of the same session; **this file supersedes it** and carries the
sections `/handoff` requires. Read this one.

## What shipped

| What | Proof | Test that covers it |
| ---- | ----- | ------------------- |
| The autopilot cap and window control on `/loop` | `apps/web/src/components/loop/autopilot-limits.tsx:48` | `autopilot-limits.test.tsx` — 10 tests |
| Both values accepted and bounded on the write path | `apps/web/src/app/actions/loop-dial.ts:142` and `:152` | `loop-settings-bounds.test.ts` |
| Six bounds constants, so form / action / column cannot drift | `packages/shared/src/db/loop.ts` | `loop-settings-bounds.test.ts` reads the migration as TEXT |
| The three trigger refusals as sentences | `apps/web/src/lib/loop/autopilot-refusal-copy.ts` | covered in the loop-dial suite |
| PR #28 and PR #35 merged to `wt-core` | `49cddd3f`, `a953a2e2` | CI green on both |
| Handoff + changelog queue committed | `61e68241`, `0b240459` | CI green on `61e68241` |
| **A test that failed on the first of every month** | `apps/jobs/src/publish/x-ration.test.ts:35` | itself — 9 tests, MEASURED green |

MEASURED: `autopilot_daily_cap` and `autopilot_cancel_minutes` are `not null` with
defaults of **3** and **30**. They always governed. Nothing in the product wrote or
displayed them, so every workspace ran at those two figures with no screen saying so.

**The copy claim that needed care.** The tick runs every ten minutes, so a cancel
window under ten closes between ticks and the post goes out on the following one:
later than the number says, never earlier. The sentence is **"Sahoda waits at least
this long before handing a post over"**, and `autopilot-limits.test.tsx` holds it.
"Your post goes out after N minutes" would be a claim the schedule cannot keep.

## The calendar bomb, because it is the most useful thing in this file

**MEASURED.** `apps/jobs/src/publish/x-ration.test.ts` passed in CI on 2026-08-31
(9 tests, 28ms, run 33358082836 — the log line is `✓ src/publish/x-ration.test.ts
(9 tests) 28ms`, so it ran rather than replaying a cache). It failed one test
locally on 2026-09-01 with **no code change between the two**.

The discriminator was the calendar:

```ts
const isMonthWindow = (since: Date): boolean =>
  since.getUTCDate() === 1 && since.getUTCHours() === 0
```

Its comment claimed the monthly window "is the only one that starts on the 1st at
midnight". On the first of the month the DAILY window starts there too. Both reads
then threw, the per-day guard refused first, and the assertion saw
`PER_DAY_CAP_UNREADABLE` where it expected `X_MONTHLY_RATION_UNREADABLE`.

`runPublishPost` already takes `now` (`PublishPostDeps.now`, defaulting to
`new Date()`), and both windows derive from it, so the fix is to pin it:
`now: () => NOW` with `NOW = 2026-08-17T09:30:00Z`. Any instant that is not the 1st
works.

**This is not my lane's code.** `git diff origin/wt-core..HEAD` before this fix
touched one docs file and `ops/state/changelog.pending.json` only — the defect is
`wt-core`'s and would have fired for every lane today. It is small, local and it
un-reds the gate for everyone, so it is fixed here rather than reported.

## What was NOT done, and why

- **Playwright smoke: UNRUN, not passed.** Chromium in this sandbox cannot complete
  any outbound HTTPS request and every @smoke spec signs in through Clerk. The CI
  `smoke` job cannot substitute — see the next section.
- **Did not re-measure the @smoke test count.** CLAUDE.md carries 118 tests in 37
  files, MEASURED 2026-08-26. Unmeasurable here for the same reason. INFERRED
  unchanged; treat it as stale until somebody runs it.
- **Did not promote `wt-core` → `wt-web`.** The one gated step in the system and a
  person's call. A stale `--no-ff` promotion commit `093e0f31` exists only in a
  deleted local branch; re-cut from `a953a2e2` rather than reusing it.
- **Did not set `SAHODA_AUTOPILOT_ENABLED`.** Deliberate. It is the only real gate
  left between this code and unattended publishing, and it is not mine to flip.
- **Did not touch the six secrets.** `.env*` and prod resources are do-not-touch; a
  settings problem gets reported, never worked around.
- **Did not fix REQUESTS §18** (the QA capture hook stamping every gate run onto
  whichever card is open). It writes false audit records and deserves its own
  change, not a drive-by in a handoff commit.

## The six secrets, and where they actually went

**MEASURED.** Run **33357806266** on `wt-core` at `a953a2e2`: the smoke job's guard
failed in **20 seconds** and the runner's env block printed **six empty values, not
three**.

| Guard read | Value |
| ---------- | ----- |
| `CLERK_PUBLISHABLE`, `CLERK_SECRET`, `SUPABASE_URL` (secrets context) | all empty |
| `VAR_CLERK_PUBLISHABLE`, `VAR_CLERK_SECRET`, `VAR_SUPABASE_URL` (variables context) | all empty |

The guard reads both contexts on purpose. Both empty means the names did not land on
the Actions Variables tab either. INFERRED: they were added to the Vercel project or
the Claude cloud environment, which store the same names and which no workflow can
read.

**The remedy:** Settings → Secrets and variables → **Actions** → the **Secrets** tab
→ **Repository secrets**. All six: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. The Dependabot tab and Settings →
Environments both store secrets and neither reaches this job.

Until they exist the honest statement stands: **this project has no automated way to
run its own end-to-end suite.** Last real smoke run: 2026-08-24, 115 passed, none
skipped, 15.6m.

## Shared surfaces touched

| Surface | Change | Breaks whom |
| ------- | ------ | ----------- |
| `packages/shared/src/db/loop.ts` | **Six new exported constants** (`DEFAULT/MIN/MAX_AUTOPILOT_DAILY_CAP`, `DEFAULT/MIN/MAX_AUTOPILOT_CANCEL_MINUTES`). Additive. | Nobody. New names, nothing renamed or removed. |
| `packages/shared/src/db/loop.ts` | `AutonomyLevelSchema` **widened** from `union(0,1,2)` to include `3`. | Readers are unaffected; a `switch` over the level that has no `3` arm now has a reachable gap. `wt-core` was checked and has none. |
| `apps/jobs/src/publish/runPublishPost.ts` | Untouched — restored byte-for-byte from a scratchpad copy after mutation M2. | Nobody. |
| `apps/jobs/src/publish/x-ration.test.ts` | Test-only: pins `deps.now`. | Nobody. |
| `ops/state/changelog.pending.json` | Drained after a server ack. | Nobody. |

## Contract, migration or money

- **Contract: yes.** `packages/shared/src/db/loop.ts`, as above. PR #28 carried the
  `[contract]` prefix on `d90619e0`.
- **Migration: none written this session.** `20260828120000_loop_autopilot_l3.sql`
  landed earlier and is unchanged. `loop-settings-bounds.test.ts` reads it as text.
- **Money: no.** No price, no `pricing.config.json` edit, no ledger write, no call to
  `apply_ledger_entry`. Autopilot has never run, so nothing has ever been charged
  through it.

## Guards written, and the mutation that proved each

| Guard | Mutation applied | Result |
| ----- | ---------------- | ------ |
| `x-ration.test.ts` "an UNREADABLE count refuses transiently" — the clock pin | **M1**: `NOW` set back to `2026-09-01T09:30:00Z`, the first of a month | **RED**, reproducing the original failure exactly: `- "X_MONTHLY_RATION_UNREADABLE"` / `+ "PER_DAY_CAP_UNREADABLE"` |
| The same test's actual claim — an unreadable count must not be reported as an exhausted allowance | **M2**: `runPublishPost.ts:562` `X_RATION_UNREADABLE_CODE` → `X_RATION_EXHAUSTED_CODE` | **RED**: `- "X_MONTHLY_RATION_UNREADABLE"` / `+ "X_MONTHLY_RATION_EXHAUSTED"` |

Both restored from scratchpad copies, never `git checkout`. Re-verified green after
each: 9 passed.

**Not re-mutated this session**, because they were mutation-proved when written
earlier in this lane and their code is unchanged: the autopilot kill switch, the four
cron-route set-guards, and the gate `FAIL_CLOSED` path in `tick-all.ts`.

## Anything retracted

**One, with the measurement.** Yesterday's handoff listed `DEVOPS_INGEST_TOKEN`
returning 401 as an open blocker on the changelog sync. **Retracted — MEASURED.**
This session's sync posted, the server acknowledged, and both pending queues drained.
`scripts/ops-sync.mjs` drains only after `if (!ack) return`, and `post()` returns
null on any non-2xx and on an unset token, so a drained queue is proof the endpoint
accepted the POST. I had misread the printed `changelog 0 · qa 0` as "nothing was
sent"; it is `ack[k]`, what the server stored, legitimately 0 for an idempotent
re-send.

**A second retraction, from earlier in the session and recorded so it is not
re-derived.** I claimed autopilot would "silently do nothing" because both settings
columns could be null. They cannot: both are `not null` with defaults of 3 and 30.

## The two pending queues are not one rule

They look alike and are governed oppositely. I got this wrong twice in one session.

| File | On a dirty tree | Why |
| ---- | --------------- | --- |
| `ops/state/changelog.pending.json` | **commit it** | Doc 13 §9.1: committed and reviewable in every PR. Drained only after an ack. |
| `ops/state/qa.pending.json` | **revert it, always** | REQUESTS §18: the capture hook stamps every gate run with whatever card is open. It has been depositing `pass` and `fail` rows on SL-054, the card recording that production was down for 22h40m. |

A pre-commit hook refuses the second by name. It caught me and it was right.
`ALLOW_QA_PENDING=1` exists only for a genuine change to that file's shape.

## The state of autopilot

- **`SAHODA_AUTOPILOT_ENABLED` is set nowhere.** One environment variable stands
  between this code and unattended publishing. Eleven plausible "yes" values are each
  a no; `autopilot-enabled.test.ts` has 14 tests on it.
- **The database trigger** in `20260828120000_loop_autopilot_l3.sql` refuses level 3
  to any workspace without a supervised cycle that reached `reported` and a Brand
  Brain with four fields confirmed. A rule about rows, enforced by Postgres, that
  application code cannot talk past.
- **No autopilot run has ever happened.** Neither the cap nor the window has governed
  a real post.

To turn it on, in order: set `SAHODA_AUTOPILOT_ENABLED` on production, promote
`wt-core` → `wt-web` (Vercel crons run on production deployments only), then set a
channel to autopilot on `/loop` and let the database decide whether that workspace
qualifies.

## What the next session in THIS lane should pick up

1. **Get `apps/jobs/src/publish/x-ration.test.ts`'s fix into `wt-core`.** Until it is
   there, every lane's gate is red on the first of the month.
2. **Sweep for the same calendar bomb elsewhere.** `grep -rn "getUTCDate() === 1"`
   over `apps/` and `packages/`. One test discriminated two windows by a date that
   coincides once a month; there is no reason to think it is the only one.
3. **REQUESTS §18** — the QA capture hook's attribution defect. It writes `pass` and
   `fail` rows onto a stranger's incident card. A run with no identifiable card
   belongs against a null `task_code`, or nowhere.
4. Autopilot itself is finished and switched off. It needs a decision, not code.

## Gate

MEASURED on this working tree, 2026-09-01. Nothing piped; `--force` on turbo so no
leg is a cache replay.

| Leg | Command | Result |
| --- | ------- | ------ |
| turbo | `pnpm turbo run typecheck lint test --force` | **PASS** — `Tasks: 27 successful, 27 total`, `Cached: 0 cached, 27 total`, 5m9s |
| root vitest | `pnpm exec vitest run` | **PASS** — 15 files, **223 tests**, exit 0 |
| prettier | `npx prettier --check .` | **PASS** — "All matched files use Prettier code style!" |
| Playwright @smoke | `turbo test:smoke` | **UNRUN.** Chromium here cannot complete an outbound HTTPS request and every @smoke spec signs in through Clerk. Not passed. |

Per-package test files: research 13 · shared 32 · publishing 27 · mesh 26 · sites 53 ·
billing 30 (+1 skipped) · jobs 34 · db 41 (+12 skipped) · web 516 (+3 skipped).

**The first run of this gate was RED** — `@sahoda/jobs` 1 failed of 396 — which is
how the calendar bomb was found. Grouped by error message it was one message in one
file, so a diff and not an environment. It is fixed above and the figures here are
from the run after the fix.
