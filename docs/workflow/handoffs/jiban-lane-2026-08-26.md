# Handoff — lane — 2026-08-26

**Owner** jiban · **Branch** `claude/kickoff-jiban-4fvij0` at `93b5dd1`, cut from
`wt-core` (level with it at session start, 0/0). Pushed: yes. PR
[#9](https://github.com/development156/sahodalabs/pull/9) → `wt-core`, draft.

**This is not jiban's design handoff for today.** That is
`jiban-design-2026-08-26.md` on `claude/lead-design-7m7ios`, it is longer, and it
is the record for every design item. This file covers one short session that did
no design work, and it is filed separately on purpose — see the naming note
below, and the lane question that is still open.

---

## Why this file is called `-lane-` and not `-design-`

Two separate reasons, and the second is a live gap in the tooling.

1. **A collision avoided.** `jiban-design-2026-08-26.md` already exists on the
   design lane. A second file of that name here would conflict on merge into
   `wt-core` — two lanes, one owner, one role, one date.

2. **`scripts/auto-handoff.mjs` cannot see this session's role.** It derives the
   role by testing the BRANCH against `/design/`, `/research/`, `/advisor/`.
   This session was started with `/lead-design`, so its role is design, but its
   branch is `claude/kickoff-jiban-4fvij0` and matches none of the three. It
   falls through to `'lane'`.

   **The consequence is the one girija already hit from the other direction:**
   `/kickoff` globs `docs/workflow/handoffs/*-<role>-*.md`, so
   `ls *-design-*.md` will never return this file. A session's own handoff is
   invisible to the tooling meant to read it.

   MEASURED: the hook wrote `jiban-lane-2026-08-26.md` unprompted at the end of
   this session, with owner `jiban` correct and role wrong.

   **Not filed as a fix.** `auto-handoff.mjs` came from `wt-web` via `9b219be`,
   runs as a Stop hook in every session in every lane, and already carries one
   documented defect. A second lane changing it on its own reading is not the
   call. A `/kickoff` branch is a real and repeatable case, so the role regex
   wants a fourth arm or a declared role the way the owner is declared.

---

## What shipped

| # | What | Proof | Covered by |
|---|---|---|---|
| 1 | `scripts/auto-handoff.mjs` formatted; the format gate is green on a fresh `wt-core` lane again | `93b5dd1` | `prettier --check .` — watched red before, green after, same tree |

**The red was inherited, not written here.** `prettier --check .` fails on an
**untouched** tree for every lane cut from `wt-core`: the file arrived from
`wt-web` via `9b219be` already unformatted. The design lane fixed the same thing
in `ad07c37`, but that commit sits behind ten unmerged commits on
`claude/lead-design-7m7ios` and is **not** an ancestor of `wt-core` — MEASURED
with `git merge-base --is-ancestor`.

**The two fixes are byte-identical.** `diff` against
`origin/claude/lead-design-7m7ios:scripts/auto-handoff.mjs` reports no
difference, so whichever lands first the other merges without a conflict. That
was checked rather than assumed, because two independently formatted copies of
one file is the shape that produces a conflict nobody expects.

Formatting only: whitespace, quote style, arrow parens, trailing commas, ternary
and chain indentation. Every hunk was read individually rather than trusted to a
whitespace-insensitive diff, because quote style and arrow parens are not
whitespace. **The marker string and the `existsSync` check are untouched**, so
the documented self-overwrite defect is neither fixed nor worsened.

---

## What was NOT done, and why

- **No design work. None invented.** The session was a `/kickoff`. The ten items
  in the design handoff are marked founder decisions rather than tickets, and
  "do not invent work against these" is their own instruction.
- **Playwright: UNRUN. Not passed.** Unchanged and environmental — Chromium in
  this sandbox completes no outbound HTTPS request at all and every `@smoke`
  spec signs in through Clerk. REQUESTS §25. This diff touches no runtime code,
  so no spec can be affected by it.
- **`lint` was not run locally.** The Stop hook's leg is `typecheck test` only.
  CI runs the third leg and covers it.
- **`auto-handoff.mjs` was not executed to test its behaviour**, deliberately.
  No handoff existed at the owner-derived path on this branch, so running it
  would have written a file as a side effect. Its formatting was verified by
  reading the diff, not by running it.

---

## Shared surfaces touched

**One, and it is a read surface that runs everywhere.**

`scripts/auto-handoff.mjs` — a Stop hook that runs in **every session in every
lane**. Formatting only; semantically identical. Nothing imports it, nothing
constructs from it, so it breaks neither readers nor constructors.

Nothing in `packages/*`. No migration, no server action, no query, no
dependency, no token, no component.

---

## Guards written, and the mutation that proved each

**None written.** One existing guard was watched failing and passing, and it was
not watched by choice — the Stop hook ran it and it went red.

| Guard | State | What it said |
|---|---|---|
| `prettier --check .` | **RED** before, on an untouched tree | `[warn] scripts/auto-handoff.mjs` · exit 1 |
| `prettier --check .` | **GREEN** after, same tree, one file changed | `All matched files use Prettier code style!` · exit 0 |

That is the guard shown to fail, on the real defect, not inspected.

---

## Anything that changes an assumption

1. **The gate workflow fires on push again, and this is the confirmation
   REQUESTS §27 asked for.** That section recorded `.github/workflows/gate.yml`
   silently producing no run for two consecutive commits, and changed the
   trigger to `on: push`. MEASURED here: the push of `93b5dd1` started run
   `32948927959` within seconds. §27's own closing sentence — that a check which
   silently does not run is worse than no check — can be read as holding for
   now.

2. **The QA capture hook still misattributes, and it captured a cache replay.**
   Three rows were queued against card **SL-054**, which has nothing to do with
   this work. That is the misattribution the advisor found in `608e288`, and it
   is still queuing. Worse than the wrong card: one row records the run that
   finished `272ms >>> FULL TURBO` — a **cache replay, which verified nothing**
   and which this session explicitly discarded and re-ran with `--force`. It is
   filed as a `"status": "pass"`. A second row files `@sahoda/db`'s test output
   under `"suite": "typecheck"`.

   **`ops/state/qa.pending.json` was reverted, not committed**, per the project
   rule and the `.githooks/pre-commit` guard. Recorded here because a QA record
   that says "pass" for a run which executed nothing is the exact shape this
   project keeps finding.

3. **The stop hook's turbo leg is narrower than the gate.** It runs
   `--filter="...[origin/main]"`, which selects **all 9 packages** — identical
   to unfiltered, because `origin/main` is 692 commits behind so everything
   reads as changed. So the filter is harmless. But it runs `typecheck test`
   only: **18 tasks, where the full gate is 27.** The missing third is `lint`.
   Anyone reading a green stop hook as a green gate is reading two thirds of it.

4. **The sandbox does not always run its own setup script.** This session opened
   with no `.sahoda-setup-status`, no `.env`, no `node_modules` and no
   `core.hooksPath`. Every required variable WAS present on the environment;
   `scripts/cloud-setup.sh` had simply never executed. Running it by hand fixed
   it completely (`OK`, 43 set). **The absent status file is not by itself
   evidence of an incomplete environment** — check the variables before
   believing it, and check them before stopping.

---

## Gate

Run on `93b5dd1`, clean tree. **No leg was piped.**

| leg | result | evidence |
|---|---|---|
| `prettier --check .` (root) | **PASS** | `All matched files use Prettier code style!` |
| `turbo run typecheck test` (9 packages, `--force`) | **PASS** | `Tasks: 18 successful, 18 total` |
| ↳ `@sahoda/web:test` | **PASS** | `389 passed \| 3 skipped (392)` files |
| ↳ `@sahoda/db:test` | **PASS** | `33 passed \| 12 skipped (45)` files, `610 passed \| 207 skipped (817)` tests |
| ↳ shared 20 · research 13 · billing 30\|1 · publishing 25 · sites 53 · mesh 23 · jobs 34 | **PASS** | all files passed |
| `lint` (turbo) | **NOT RUN locally** | CI covers it |
| `pnpm build` / js-budget | **NOT RUN** | no route code touched |
| **Playwright `test:smoke`** | **UNRUN** | NOT passed. Unchanged environmental reason |
| CI | in progress at time of writing | run `32948927959` |

**`--force` is what makes the pass mean anything.** The first run came back
`Cached: 18 cached, 18 total · Time: 272ms >>> FULL TURBO` and verified nothing.
It was discarded and re-run. `@sahoda/db`'s **12 skipped files and 207 skipped
tests** are for want of database credentials and are unchanged by this diff —
recorded so the green above is not read as broader than it is.

---

## For whoever picks this up

**Two questions are open and both are the founder's.** Nothing here should be
guessed at.

1. **Which lane does jiban's design work belong on?** There are now three
   candidates and that is the problem: `claude/lead-design-7m7ios` (10 commits
   ahead of `wt-core`, PR #6 open, the real design lane), `wt-jiban2` (exists,
   sits at the `wt-core` tip, carries no design work), and this branch. One
   person, one role, three lanes is the collision `08_ROLES.md` says git will
   never show you.

2. **What is to be designed?** Not picked here, deliberately.

**And one thing that is not a question.** PR #9 is one file and exists only to
get `wt-core`'s format leg green. It should merge or be closed in favour of
`ad07c37` — either is correct, and the two are byte-identical — but leaving both
unmerged leaves every new lane inheriting a red gate on an untouched tree.
