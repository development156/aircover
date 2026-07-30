# 05 (ORIGINAL — SUPERSEDED 2026-07-28) — Branch reconciliation: getting to one trunk

> ⚠️ **Do not execute the sequence in §4 of this file.** An adversarial review on 2026-07-28
> found six literal-execution failures and two silent-loss vectors in it. The corrected,
> executable runbook is `05-branch-reconciliation.md`. The *analysis* below (§1–§3, §5–§7 —
> branch inventory, migration safety, keep/abandon calls) remains valid and verified.

**Verdict up front: this is a two-day job, not a two-week one, and there are ZERO migration
collisions.** The situation looks far worse than it is.

---

## 1. The correction that changes everything

The brief for this audit stated that `wt-db` has **87 commits in no other branch** and `sites-wip`
has **76**. That is not what those numbers mean.

`git rev-list --left-right --count origin/main...<branch>` returns `behind<TAB>ahead`. The 87 and
76 are how far each branch has fallen **behind** `origin/main`. Unique work is the second number:

| Branch | Behind `origin/main` | **Unique commits** | Reality |
|---|---:|---:|---|
| `wt-db` | 87 | **2** | Two commits, no migrations. |
| `sites-wip` | 76 | **1** | One commit, 696 lines. |
| `feat/admin-ops` | 2 | 12 → **1 truly stranded** | 11 of 12 already in `wt-web` by patch-id. |

Verified with `git cherry -v` (patch-id comparison, not SHA comparison) and `git branch --contains`.

**Total genuinely stranded work across the whole repository: 4 commits.**

---

## 2. Branch-by-branch

### 2.1 `wt-web` — the trunk. Keep.
`cb10128`, 36 ahead of `origin/main`. Contains `wt-pub`, `wt-mesh`, `wt-obs`, `wt-billing` in full.
Vercel deploys production from this branch.

⚠️ **`cb10128` is unpushed.** `origin/wt-web` is at `71610dc`. The commit "ui: Home — the week at a
glance" exists only on this machine and is **not deployed**. Push it before anything else — a lost
laptop loses it.

### 2.2 `wt-admin` — merge it. Keep.
`e086f6e`, 58 ahead of `wt-web`, PR #4 open since 2026-07-25 (139 files, +16,671/−63).

**Merging this reduces risk rather than adding it.** Its nine migrations are *already applied to
the production database* (`00-` §1.5). Right now the deployed code does not contain the migrations
its own database is running. Merging closes that gap. Leaving PR #4 open is the risk.

Still wanted under the new scope? **Yes — frozen.** Merge it, run it, add nothing.

### 2.3 `wt-pub`, `wt-mesh`, `wt-obs`, `wt-billing` — delete. Zero risk.
All four verified via `git merge-base --is-ancestor` to be **fully contained** in `wt-web`
(`wt-mesh`, `wt-obs`, `wt-billing` are also in `origin/main`). They are 0 commits ahead. Deleting
them loses nothing.

### 2.4 `wt-db` — cherry-pick both commits. Keep.

| Commit | Date | Content | Wanted? |
|---|---|---|---|
| `cd2053c` | 07-19 | `test(db): shared interruption-recovery sweep + guard against mass delete` — adds `tests/helpers/sweep.ts` (54 lines) + `tests/sweep.test.ts` (142 lines), refactors 4 live suites onto a shared sweep. | ✅ **Yes — take it first.** It is the mass-delete guard for exactly the live tests that R-01 is about. |
| `e4b425c` | 07-20 | `feat(db): seeded Chai & Chapters demo workspace` — `packages/db/seeds/demo/*`, 21 files, ~3,500 LOC incl. `destroy.ts`. | ⚠️ **Conditional.** Useful for design-partner demos; written against the 14-migration schema when the DB now has 23. |

**Migrations: none touched.** `git diff --stat wt-db wt-web -- packages/db/supabase/migrations`
returns **empty** — the 14 migration files are byte-identical on both branches.

**Recommendation:** cherry-pick `cd2053c` in Week 0 (it supports R-01). Cherry-pick `e4b425c` only
if you want the demo seed, and re-run it against a Supabase **branch** first (U-07) — it is 8 days
and 9 migrations stale, and `demo-seed-reseed-hazards` records that append-only tables survive a
re-seed unless you destroy first.

### 2.5 `sites-wip` — **abandon.** 

One commit, `58ba747` "feat(sites): SiteStore port and the wt-web mount contract": 696 insertions
across `packages/sites/src/store.ts` (75), `store.test.ts` (384), `index.ts` (+5),
`index.test.ts` (28), and a 204-line spec doc.

`wt-web` does **not** have `packages/sites/src/store.ts` — this work is genuinely absent from the
trunk. But:

- **Sites v0 is cut from the 30-day plan** (`03-` §7). A `SiteStore` port serves a module that has
  no deployer, no consumer in `apps/web`, and no revenue attached.
- ⚠️ **This is the one branch with a migration hazard.** `sites-wip` carries only **13** migration
  files — it is missing `20260719160916_add_upsert_connection.sql`, because it branched from
  `wt-pub` before that migration landed. A naive `git checkout sites-wip -- .`, a squash from the
  wrong side, or a rebase resolved in `sites-wip`'s favour would **delete an applied migration
  from the repo**. A normal `git merge` is safe (the file is simply added on the trunk side), but
  the trap is real and it is the only one in this repository.

**Recommendation: abandon.** Tag it so it is recoverable, then delete the branch:
`git tag archive/sites-wip sites-wip`. Recovering 696 lines later costs less than carrying a
branch whose only unique property is a missing migration.

### 2.6 `feat/admin-ops` — cherry-pick one commit, then delete.

12 commits ahead of `origin/main`; `git cherry -v wt-web feat/admin-ops` shows **11 are already in
`wt-web` by patch-id**. Only `ff806db` "wip(obs): sentry, secret scrubbing, learnings" is stranded
— 10 files, +64/−42, touching `lib/observability/scrub.ts`, `secret-values.ts`,
`sentry-options.test.ts`, `wallet/correction.ts` and `scripts/verify-sentry.mjs`.

Two cautions:
1. All five files **differ** from `wt-web`'s versions — `wt-web` has moved on independently. This
   is a real (small) merge, not a fast-forward. Review it, do not auto-apply.
2. It is a **`wip:` commit**, and `scrubber-is-a-dos-surface` records that redaction regexes run on
   the crash path where an unanchored pattern caused a 22-second stall. Do not land WIP scrubber
   changes without running the scrub tests.

**Recommendation:** cherry-pick `ff806db`, resolve against current `wt-web`, run
`pnpm --filter @sahoda/web test --force`, then delete the branch. This is also the branch the
**stale primary checkout** is sitting on — moving it to the trunk fixes that too.

### 2.7 The two stashes — one is a duplicate.

- `stash@{0}` "wt-web LEARNINGS cleanup (pre-merge, not mine)" — `LEARNINGS.md` only, +6/−9.
  `learnings-union-merge-duplicates` warns that the union merge driver re-duplicates entries on
  every rebase and dedupe must happen **after** rebasing. **Drop it** and dedupe once the trunk
  exists.
- `stash@{1}` "wt-obs scrubber refinements" — 8 files, +52/−30. **This is the same work as
  `ff806db`** (same observability files, same shape). Take the commit, drop the stash. Do not
  apply both.

### 2.8 `branch` — verify, then delete.
Local `63afdee` "fix: resolve conflicts favoring wt-obs", 1 ahead of `origin/main` by patch-id. The
underlying feature (`2fdd7f4`, team bug-fix workflow) is already on `origin/main`. `63afdee` is a
conflict-resolution artefact. Confirm nothing unique, then delete. Its name is also actively
confusing.

### 2.9 `backup/pre-deploy-fix-855e00a` — keep until Gate 0, then delete.
A safety net from the 07-24 deploy incident. Delete once the trunk is green and pushed.

---

## 3. Migration collisions — named explicitly

**There are none.** Checked exhaustively:

| Comparison | Result |
|---|---|
| `wt-db` ↔ `wt-web` (14 files) | `git diff --stat` → **empty**. Byte-identical. |
| `wt-admin` ↔ `wt-web` | **9 files ADDED, 0 modified, 0 deleted.** All timestamps `20260725102928`+, strictly later than `wt-web`'s newest (`20260719160916`). No renumbering needed. |
| `feat/admin-ops` ↔ `wt-web` | **No migration files touched at all.** |
| `sites-wip` ↔ `wt-web` | ⚠️ **13 files vs 14 — `20260719160916_add_upsert_connection.sql` is ABSENT on `sites-wip`.** Not a collision; a *gap*. The only migration hazard in the repo, and it disappears when the branch is abandoned. |

**All 23 migrations are already applied** to `rloztdhzfliyvpvxsgjl`, so no merge in this plan
produces an unapplied migration. The code is catching up to the database, not the reverse.

---

## 4. The ordered sequence

Lowest risk first. Every step is independently verifiable; stop at any failure.

```bash
# ── STEP 0 · Protect what only exists locally ───────────────────────────────
git push origin wt-web              # cb10128 is unpushed and undeployed
git tag archive/sites-wip sites-wip # recover-ability before any deletion
git tag archive/wt-db     wt-db
git push origin --tags

# ── STEP 1 · Merge PR #4 (wt-admin → wt-web) ────────────────────────────────
# Do this in the GitHub UI so the PR closes cleanly. Merge commit, not squash:
# 58 commits carry the SL-0xx trail the ops board reads via commit scope.
# Expect ZERO migration conflicts (9 pure additions).
git checkout wt-web && git pull
pnpm install --frozen-lockfile
pnpm turbo run typecheck test --force        # must be green BEFORE proceeding

# ── STEP 2 · Recover the 3 stranded commits ────────────────────────────────
git cherry-pick cd2053c                      # wt-db: mass-delete guard  (supports R-01)
git cherry-pick ff806db                      # feat/admin-ops: scrubber WIP — REVIEW the conflicts
pnpm --filter @sahoda/web test --force       # scrubber tests must pass (DoS surface)
# Optional, only if the demo seed is wanted; validate on a Supabase branch first:
# git cherry-pick e4b425c

# ── STEP 3 · Make `main` real again ────────────────────────────────────────
# Local `main` is at 8fc57be "Initial commit", 188 behind. It is not a branch to
# merge — it is a stale pointer. Do NOT try to reconcile it; overwrite it.
git checkout main
git reset --hard origin/main                 # discard the bogus local commit
git merge --ff-only wt-web                   # trunk becomes main
git push origin main

# ── STEP 4 · Repoint the deploy at main ────────────────────────────────────
# Vercel → Settings → Git → Production Branch: wt-web  →  main
# GitHub → Settings → Branches → protect `main`, require the `gate` check.
# Until this step, branch protection on `main` protects nothing that ships.

# ── STEP 5 · Delete what is provably contained ─────────────────────────────
git branch -d wt-pub wt-mesh wt-obs wt-billing   # -d refuses if NOT merged: the safety check
git branch -D sites-wip branch                    # abandoned; tagged above
git branch -D feat/admin-ops wt-db                # cherry-picked above
git push origin --delete wt-pub wt-mesh wt-obs wt-billing wt-db branch
git stash drop stash@{1}                          # duplicate of ff806db
git stash drop stash@{0}                          # LEARNINGS churn; dedupe on the trunk instead

# ── STEP 6 · Tidy the worktrees ────────────────────────────────────────────
git worktree remove .claude/worktrees/wt-pub
git worktree remove .claude/worktrees/wt-mesh
git worktree remove .claude/worktrees/wt-obs
git worktree remove .claude/worktrees/wt-billing
git worktree remove .claude/worktrees/wt-db
git worktree prune
# Move the PRIMARY checkout off the stale feat/admin-ops:
git -C /home/divas/Documents/GitHub/sahodalabs checkout main
```

**End state: one trunk (`main`), one working worktree, two branches (`wt-web` as the active lane
if you still want one, `backup/…` until Gate 0).**

---

## 5. What to do about local `main`

Local `main` sits at `8fc57be` "Initial commit" — 188 behind, 1 ahead. That single "ahead" commit
is the corruption artefact from the 2026-07-24 incident recorded in
`lockfile-merge-corruption` and recovered by cherry-pick at the time.

**Do not merge it, rebase it, or try to reconcile it.** It shares almost no history with the work.
`git reset --hard origin/main` (Step 3) is correct and safe: `origin/main` is healthy at `22a35aa`
and contains PRs #1, #2, #3 and #5.

The danger of leaving it: it is the branch a new teammate checks out by default, and the branch
`gh pr create` targets by default. Anyone who branches from local `main` today starts from an
empty repository and will produce a pull request with 188 phantom changes.

---

## 6. Risks in this sequence, and the mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| PR #4 conflicts in `packages/shared` | Medium — `git diff wt-admin wt-web` shows 33 files differ there, incl. `enums.ts`, `db/ops.ts`, `ops/state.ts` | Merge `wt-web` **into** `wt-admin` first if the PR is messy; `8f379e9` shows this was already done once. Resolve in `wt-web`'s favour for tokens/UI, `wt-admin`'s for `ops_*`. |
| `pnpm-lock.yaml` corruption on merge | **Medium-high — it has happened before** (`lockfile-merge-corruption`: a plain merge produced a duplicate key *and* a dropped dependency, and neither `safe_load` nor `uniq -d` caught it) | Never hand-merge the lockfile. On any conflict: `git checkout --theirs pnpm-lock.yaml && pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile` must succeed. `.gitattributes` already guards this. |
| `ff806db` cherry-pick breaks the scrubber | Medium — it is a `wip:` commit and all 5 files have diverged | Run `pnpm --filter @sahoda/web test --force` immediately. The scrubber runs on the crash path; a bad regex is a 22-second stall, not a test failure. |
| Repo hooks reformat files you did not touch | High — `repo-hooks-rewrite-working-tree` records prettier/eslint `--fix` doing exactly this | Stage explicit paths. Never `git add -A` during this sequence. |
| Someone deletes an applied migration via `sites-wip` | Low, but catastrophic | Abandon `sites-wip` (§2.5). It is the only branch missing an applied migration. |
| Vercel blocks the deploy on author | Low | `vercel-deploy-pipeline`: commits must be authored `SAHODALABS`. Cherry-picks preserve the original author — verify with `git log --format='%an'` before pushing. |

---

## 7. Recommended abandonments — the honest cost

| Abandon | Lines lost | Why it costs less than merging |
|---|---:|---|
| `sites-wip` (`58ba747`) | 696 | Serves a module cut from the 30-day plan; it is also the only branch missing an applied migration. Tagged, recoverable in one command. |
| `stash@{0}` | 15 | `LEARNINGS.md` churn that the union-merge driver will re-duplicate anyway. |
| `stash@{1}` | 82 | Duplicate of `ff806db`. Applying both would conflict with itself. |
| `wt-db` `e4b425c` (demo seed) | ~3,500 | **Defer, don't abandon.** It is 9 migrations stale and only needed for a demo. Re-validate on a Supabase branch when a design-partner demo is actually scheduled. |
| `branch` (`63afdee`) | small | Conflict-resolution artefact whose feature is already on `main`; the name alone is a hazard. |

**Total permanently abandoned: ~793 lines, none of it on the critical path.**
**Total recovered: 3 commits — the mass-delete test guard, the scrubber fixes, and (optionally) the demo seed.**
