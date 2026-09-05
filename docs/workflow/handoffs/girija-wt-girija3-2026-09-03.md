# Handoff — girija — wt-girija3 — 2026-09-03

**Branch** `wt-girija3` at `5c46a6f6`. Lane `wt-girija3`. Pushed: **yes**, and
`origin/wt-girija3` matches `HEAD` exactly.

**This session was on the real lane, not a harness-pinned `claude/...` branch.**
That is the first time in this lane's history. The 26, 27 and 28 August sessions
were all pinned elsewhere and said so; this one had no such note to write.

> **No product code was written and no commit was authored by this session.**
> What follows is a setup session and a measurement session. The value in it is
> four facts about the machine and the trunk, one correction of my own figure
> from earlier in the same session, and one decision I refused to take alone.

**PR [#27](https://github.com/development156/sahodalabs/pull/27) is MERGED** into
`wt-core`, 2026-08-28T19:02:34Z, by development156, 5 files, +594 / -10, six
commits. That was the previous session's work and this lane's only outstanding
item. It is closed, so nothing carries forward from it.

---

## What shipped

**No code. One push, which was a merge.**

| # | What | Proof | Covered by |
| - | ---- | ----- | ---------- |
| 1 | `wt-core` taken into the lane at kickoff: 144 commits, CLEAN, no conflict | `726f9892`, `node scripts/lane-sync.mjs pull` | n/a, a merge |
| 2 | That merge pushed to `origin/wt-girija3` | `f3d962f8..726f9892` | gate run 959, below |
| 3 | The sandbox given a working browser | `.sandbox-capabilities.json`, verdict changed `NO_BROWSER` → `LOCAL_ONLY` | the probe itself, re-run |

Item 3 was the founder's instruction, run verbatim:
`bash scripts/cloud-setup.sh && pnpm --filter @sahoda/web exec playwright install chromium`.

### What the setup actually changed, MEASURED

| | before | after |
| --- | --- | --- |
| probe verdict | `NO_BROWSER` | **`LOCAL_ONLY`** |
| Chromium | not resolvable from `apps/web` | `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome` |
| http loopback | untestable | **200** |
| http and https outbound | untestable | `ERR_CONNECTION_RESET`, both |
| the browser leg | impossible | **runnable**, over Node |

The probe wrote `SAHODA_BROWSER_VIA_NODE=1` into the three `.env` files. Browser
requests now travel over Node's transport instead of Chromium's own socket, so
the suite CAN run here. **WebSockets are the stated exception**: `context.route`
cannot intercept them, so any spec that depends on one is still unrunnable.

The socket-level constraint itself is unchanged and REQUESTS §25 still describes
it correctly. `--ignore-certificate-errors` remains the wrong remedy and is
forbidden: the reset happens before any certificate is presented.

`scripts/cloud-setup.sh` reported all 7 required environment variables present,
43 set in total, three `.env` files written at 46 vars each, `pnpm install` clean
and 4 MCP servers declared.

---

## What was NOT done, and why

- **The Playwright `@smoke` leg was NOT dispatched, and this is the one thing
  needing a decision.** The `smoke` job on `.github/workflows/gate.yml:178` is
  gated `if: github.event_name == 'workflow_dispatch' && inputs.ack_target != ''`,
  where `ack_target` is the Supabase project ref typed by a person. There is one
  Supabase project in this account and it is production. The job's own header
  says every `@smoke` spec mints a Clerk user and lets the app create a workspace
  and a credit ledger in it. Dispatching that is a deliberate act by somebody who
  has named the database, not a tidy-up a session performs because CI came back.
- **The `@smoke` leg was not run locally either.** The probe now says it could
  be, which is new. It was not attempted, so it is **UNRUN, not passed** — and
  the WebSocket exception means "the suite can run here" is not yet a claim that
  every spec in it can.
- **Nothing was done about `wt-core` and `wt-web` being red.** Both are failing
  (see Gate). Neither is this lane's, and repairing the trunk from a lane is how
  two sessions write the same fix twice. It is reported, not fixed.
- **Nothing was pushed to `wt-core`.** This session has no diff to offer it:
  MEASURED at `726f9892`, `git diff --name-only origin/wt-core HEAD` returned
  **0 files**.
- **No pull request was opened**, for the same reason. A PR whose diff is empty
  is a review request for nothing.
- **`ops/state/qa.pending.json` was reverted, not committed.** The SessionStart
  ops sync rewrote it, 1 insertion and 2,121 deletions. It is scratch, every gate
  run rewrites it, and `.githooks/pre-commit` refuses any commit that stages it.
  The rule is revert it, never commit it. The tree is clean.
- **I did not guess at a missing owner and lane.** The second `/kickoff` of this
  session carried a shell command in place of `owner:` and `branch:`. The card
  says stop and ask, so I asked. Nothing was at risk either way, because both
  values were already pinned and verified from the first kickoff, but guessing
  once is how a session's memory gets filed under someone else's lane.

---

## Shared surfaces touched

**None.** No file under `apps/`, `packages/`, `docs/` or `.github/` was edited by
this session. The only writes were to `.env`, `apps/web/.env`,
`apps/web/.env.local` and `.sandbox-capabilities.json`, all of which are
environment state rather than repository content, plus this handoff.

## Contract, migration or money

**None.** No `packages/shared`, no migration, no price, no ledger call.

## Guards written, and the mutation that proved each

**None, and that is the honest answer rather than a modest one.** No code was
written, so no guard was owed and none was invented. The only thing this session
proved is a property of the machine, and it was proved by re-running the probe
and reading a different verdict, which is a measurement and not a guard.

---

## Anything retracted

**One, and it was mine, from this same session.**

I reported the product at **59 routes** in the first kickoff. It is **60**.
MEASURED twice after the trunk merge, by `find apps/web/src/app -name page.tsx | wc -l`
and independently by `scripts/cloud-setup.sh`, which prints the count and grades
it. The figure was one behind because I took it before `lane-sync pull` had
finished bringing `wt-core` in, and then did not re-take it.

That is small, and it is exactly the defect CLAUDE.md names: a stale number in a
report is the same defect as a stale number on a screen. The fix is not "check
harder", it is to take the count AFTER the merge that can change it, which is
what the kickoff card already orders and what I did out of sequence.

**One thing that reads like a retraction and is not.** My first report said the
`@smoke` leg is UNRUN here and named `NO_BROWSER` as the reason. The verdict has
since become `LOCAL_ONLY`. The claim was true when made and the leg is still
UNRUN; only the reason changed, and it changed because the founder had me change
it.

---

## What the next session in THIS lane should pick up

1. **Decide the smoke dispatch, or leave it decided.** The head at `5c46a6f6` is
   green on everything CI runs. The only unproven half is the browser suite, and
   the only two ways to prove it are a dispatch that writes to the production
   database, or a local run over the new Node transport. **The local run is now
   possible and costs nothing** — that is the new fact this session bought, and
   nobody has spent it yet.
2. **Do not treat `wt-core` red as your diff.** As of 2026-08-29T20:09Z the
   trunk's own gate fails in 3 seconds without executing a step. Check the run
   duration before you believe a failure.
3. **Two sessions were on `wt-girija3` at once.** MEASURED: `origin` moved under
   me twice while I worked, first by 4 commits, then by 25. Both fast-forwarded
   cleanly, so nothing was lost, but CLAUDE.md's "one person, one lane, at a
   time" was not held. Pull immediately before any push here.
4. **The three duplicate database-reachability classifiers are still there.**
   `lib/testing/db-reachability.ts` (wt-jiban3) is the live one, imported by
   `export-drift.test.ts:68`. `lib/privacy/db-reachability.ts` (this lane, PR #27)
   and `lib/privacy/db-route.ts` (wt-girija) are each imported by nothing but
   their own test. Three lanes solved one problem independently and the merge
   kept all three. Two of them are now passing tests that guard nothing, which is
   the exact shape CLAUDE.md's one rule is about.
5. Everything else owed is listed in `girija-wt-girija3-2026-08-26.md` and none of
   it moved: no credit figure on the re-resolve buttons, the design-lint baseline
   untightened, `@sahoda/db` skipping 12 of 46 test files.

---

## Gate

**The gate ran on GitHub Actions, on this exact head, and passed.** This is the
first CI verdict this lane has ever had, and it is worth more than a local run
because it is on a machine nobody in this project controls.

Run [959](https://github.com/development156/sahodalabs/actions/runs/33271855758),
job `typecheck · lint · test · format`, `wt-girija3` at `5c46a6f6`.

| leg | result |
| --- | --- |
| checkout, pnpm, node 24, install | PASS |
| **typecheck, lint and test** (turbo) | **PASS** — 19:49:42 to 20:02:39, **12m57s** |
| **root vitest** | **PASS** — 5s |
| **`prettier --check .`** | **PASS** — 35s |
| **`turbo build`** | SKIPPED by design — Vercel builds every PR |
| **Playwright `@smoke`** | **SKIPPED** by the workflow's own condition, so **UNRUN, not passed** |

Total 14m05s. `HEAD` is byte-identical to what that run tested: `git rev-parse HEAD`
is `5c46a6f6`, which is run 959's `head_sha`. **No local leg was run in this
session and none is claimed.**

### The trunk and production are both red, and it is not a test failing

MEASURED 2026-08-29, `list_workflow_runs` on `gate.yml`:

| run | branch | SHA | duration | outcome |
| --- | --- | --- | --- | --- |
| [974](https://github.com/development156/sahodalabs/actions/runs/33272710293) | **wt-core** | `4f8cb9a1` | **3s** | failure |
| [975](https://github.com/development156/sahodalabs/actions/runs/33272711389) | **wt-web** (production) | `4f8cb9a1` | 6s | failure |
| [976](https://github.com/development156/sahodalabs/actions/runs/33272732953) | wt-girija2 | `eae5c5b8` | 3s | failure |
| 959 | wt-girija3 | `5c46a6f6` | **14m05s** | success |

Run 974's job was created at 20:08:54 and completed at 20:08:57. **Three seconds
cannot have executed `actions/checkout`, let alone a test.** `get_job_logs`
returns **HTTP 404** for it, and the sibling smoke job reports a `completed_at`
*earlier* than its `started_at`, which is not a time a job can take.

This is the same signature `karunesh-wt-karunesh-2026-08-28.md` filed as its
blocker: three runs on `f096f68c` at 3, 4 and 4 seconds, logs 404, against the
same job taking 10m32s forty minutes earlier.

**INFERRED, not measured: the cause is a burst limit rather than the code.** Five
runs were created inside seven seconds (20:08:49 to 20:08:55) and every one
failed instantly, while eight runs created at 19:49:00 to 19:49:19 mostly ran
their full fourteen minutes and passed. The correlation is with arrival rate, not
with any branch or any diff. **I cannot prove it, because the proof is in the
logs and the logs 404.** Nobody should record this as established until somebody
reads a log or reproduces it deliberately.

---

## What needs a decision

1. **Whether to dispatch the `@smoke` suite against project ref
   `rloztdhzfliyvpvxsgjl`.** It writes test workspaces and credit ledgers into
   the customer database, which is why the workflow demands the ref be typed
   rather than a checkbox ticked. Not a lane's call.
2. **Who collapses the three database-reachability classifiers.** Two of the
   three guard nothing. Whoever merges into `wt-core` can see all three; a single
   lane can only see its own.
3. **`08_ROLES.md` says girija is design and jiban is research**, while the
   `/kickoff` arguments said `/lead-research`. Raised by `wt-girija2` on 26
   August, restated 27 and 28 August, still unruled. The arguments win per the
   card, so nothing has been blocked by it in four sessions. It may be worth
   ruling that the file is simply wrong and deleting the sentence.
