# 04 · Parallel sessions

Several Claude Code sessions run at once, each in its own git worktree, each on its own port, each owning a disjoint set of files. This is how a month of work happened in five weeks.

It is also where the two worst failures in the project came from. Both are avoidable and both are covered here.

---

## The mechanics

**One worktree per lane. One terminal per worktree. One port per lane.**

```
git worktree add -b wt-<lane> .claude/worktrees/wt-<lane> <base>
cd .claude/worktrees/wt-<lane>
git config --worktree user.name "SAHODALABS"
git config --worktree user.email "development@sahodalabs.com"
cp ../../../.env .env
cp ../../../apps/web/.env apps/web/.env
cp ../../../apps/web/.env apps/web/.env.local
```

Then in that directory: `claude --dangerously-skip-permissions`, paste the brief, walk away.

**Ports:** allocate a block per wave — 3241, 3242, 3243, 3244 — and Lightpanda at port+100. Never reuse a number while another lane holds it.

**Env does not travel.** `.env` files are gitignored, so a fresh worktree has none. All three copies, every time. Two sessions could not run their smoke suite at all because `apps/web/.env.local` was missing and Playwright reads that one.

**Author matters.** A new worktree inherits the personal git identity, which the deployment rejects. Set it before the first commit.

---

## How many at once

**Three or four.** The limit is not ambition.

The machine has 15 GB. Each lane runs a Next server plus a browser — roughly 3–4 GB. A session measured `next-server` OOM-killed at 3.5 GB, three times in two hours, with load peaking at 57.7. Another lost all 28 of its screenshots to system load and shipped anyway, reporting eight redesigned screens as "verified by code" — the founder opened them and said they looked unchanged. He was right.

**Lightpanda helps.** It is a Zig-based headless browser, roughly 16× lighter than Chromium, and it is why four lanes are possible at all. But it is **not interchangeable**:

| Lightpanda | Chromium |
|---|---|
| page loads, element existence | every screenshot — Lightpanda has no rendering engine |
| text content, accessible names | `getBoundingClientRect`, `getComputedStyle` |
| sign-in flows, navigation | the 44px floor, truncation, contrast |
| anything asking "what does it SAY" | anything needing two browser contexts |

Lightpanda allows one connection, one context, one page per process. It returned an identical hash and a body height of 100000000 for different pages when a session tried to screenshot with it.

**And the real ceiling is review, not memory.** Sessions run in parallel; ruling on their reports is serial. Four reports arriving together is four hours of reading.

---

## Scoping a lane

Two lanes editing the same file is a merge conflict. Two lanes editing the same *concept* is worse — it is two designs of the same thing, and only one survives.

**Split by files, and say so in the brief.** The strongest boundary used here:

> You do not touch `apps/web/src/app` or `apps/web/src/components`. Not one file. If a fix appears to need a screen change, RETURN THE DATA the screen would need, log exactly what the UI should show, and move on.

That let an infrastructure lane run alongside three UI lanes with zero collisions.

**Warn about shared surfaces loudly.** When a lane changes a shared primitive, a shared type or a fixture another lane uses, the brief must require it to say so in its report. Lanes broke each other four times this way: `adapterFor` gained a required third parameter, `decideAttach` a required fourth, `violation-copy` changed app-wide, `BrainRead` gained a required field.

**A required field breaks constructors, not readers.** Both `countLiveSends` and `BrainRead.source` looked dangerous and cost nothing, because every caller went through a zero-argument factory. Measure before you predict.

---

## The two failures worth not repeating

**A session merged onto the branch it was standing on, and pushed it.** An unguarded `git checkout -B` failed silently, so the six-way trial merge ran on the doc-only branch — during a task that explicitly said *do not merge*. The reflog caught it.

> **Verify `git branch --show-current` after every checkout. Never assume one succeeded.**

**A session attached to a peer's dev server without knowing.** Playwright's `reuseExistingServer` will silently connect to whatever is on the port. One lane tested another lane's build twice and nearly reported it as its own; the tell was an `/assets` upload appearing in a branch that has no assets.

> **Verify ownership with `readlink /proc/<pid>/cwd` before trusting a server.**

---

## Merging

The most dangerous operation in this project. It has its own rules.

**Verify containment before deciding an order.** `git merge-base --is-ancestor` over every pair. A session found that eighteen named lanes were really seven tips and six merges would have been literal no-ops — and the list it was given was wrong in five places.

**Run the full gate after every single merge.** Not at the end. If a gate goes red you need to know which merge did it.

**Merge into a staging branch, not into trunk.** Cut `wt-release` off `wt-web`, merge everything into that, prove it, and only then fast-forward. Merging straight into trunk leaves no way back when the fifth merge fails.

**Look for what only the merge can see.** Two defects in this project were invisible until branches met:

- A quarantine refactor **silently dropped `Human:`** from the injection neutraliser. Covered by nothing — 0 of 94 tests failed.
- **Eight tenant tables were missing from every DPDP export** while each branch's manifest was internally complete.

The general shape: a fix living in a file another lane made unreachable, and a guard whose coverage shrank because a lane replaced what it guarded. Enumerate every deleted and moved file across all lanes and check the import graph from every entry point.

**A concrete instance:** one lane fixed a double-charge in `onboarding-flow.tsx`. Another lane replaced that whole stage with `OnboardingStage`, making the file unreachable. Merging would have silently killed a money guard, and **nothing would have failed.**

**Take the tightest ratchet, never the last one written.** Four lanes ended with four different `design-lint` baselines. Loosening a ratchet during a merge is how it stops meaning anything.

**Prove what no single branch could.** After the last merge:

- Two channels, two bodies, two limits, two formats — saved, reloaded, read back through a surface that did not write them
- Ledger invariants 9/9, zero unsettled holds, delta accounted exactly
- The Loop's kill switch, proven with a hand-scheduled control that **survives** — the survival is the proof that matters, because scope-by-origin would have destroyed it
- Both crons returning 401 not 307, with a never-existed-path control, because an unexempt route and a non-existent route both answer 307
- `no-impossible-remedy` across every route including new sections
- The full smoke suite with a real count

---

## Migrations across lanes

**Never `supabase db push`.** Production's recorded count drifts behind its file count, and a push re-runs applied migrations.

**Version collisions happen.** Three files once shared `20260821000000`; two of them were applied in substance and could not be recorded, so `schema_migrations` under-reported by two. Renumber, verify against the catalog, then record — `INSERT` only, never re-run the DDL.

**Some migrations are deliberately unapplied and must stay that way.** The plan migration breaks signup if applied before its deploy, because live `bootstrap_workspace` reads `plans where id='free'`. Order is deploy, then apply. A brief that says "apply all migrations" will break production.

**And PGlite may not match production.** Two migrations are recorded in production with their statements while their *files were lost in a squash*. `pglite-tenant.ts` builds from the migrations directory, so a whole class of test runs against a schema production does not have.
