# 05 — Branch reconciliation runbook · v2 (corrected)

**Status:** EXECUTABLE · corrected 2026-07-28 after adversarial review (3 independent verifiers,
all returning AMEND). Supersedes `05-original-superseded.md`, whose §4 sequence failed literal
execution at six points and would have silently destroyed two pieces of uncommitted work. The
original's *analysis* (branch inventory, migration safety, keep/abandon calls) remains valid.

**Why the original §4 was replaced — all six failures verified against this repo:**

1. `git checkout wt-web` in the primary errors — every branch is checked out in a worktree.
2. Merging PR #4 in the GitHub UI deploys the untested merge to production *before* any gate runs
   (production branch is `wt-web`).
3. The gates (`turbo … test`) write to the production database — R-01 unfixed at that point.
4. `git merge --ff-only wt-web` from main is impossible (`origin/main` carries `642c5cf` +
   `22a35aa`, which wt-web lacks); the naive merge instead hits a 10-file conflict including the
   binary-flagged `pnpm-lock.yaml`.
5. Branch deletions run before worktree removals — every one fails; `feat/admin-ops` is the
   primary's own branch.
6. `cherry-pick ff806db` refuses — the same 9 files sit dirty in the wt-web worktree, holding a
   third, NEWEST version of that work (three distinct patch-ids exist).

**Silent-loss vectors closed by v2:** wt-db worktree held ~196 uncommitted lines + an untracked
`packages/db/corrections/`; `wt-obs/apps/web/.env.local` (only copy of per-worktree dev auth
keys) is git-ignored, so the clean-check passes and `worktree remove` deletes it silently.

---

## Execution rules (owner-mandated, override all instincts)

1. **STOP after every phase.** Report commands + real output; wait for approval. Never chain.
2. **HARD STOP** requiring explicit go-ahead before **Phase 3** (the one production deploy) and
   before **Phase 5** (deletions).
3. Any output differing from this runbook's predictions — a count, a conflict set, a status —
   **STOP and report. Do not improvise.** A surprise means the containment proofs may be stale.
4. Never `--force` a worktree remove. A refusal is a finding.
5. Never hand-edit `pnpm-lock.yaml`.
6. Never commit `~/sahoda-salvage-env.local` or anything derived from it.
7. Print exact command + exact output per step, plus one plain-English line each.

Context: 26 live workspaces, 17 real users, production branch currently `wt-web`, one Supabase
project (dev == prod). Baseline SHAs verified 2026-07-28 09:3x IST before execution began.

---

## PHASE 0 — PRESERVE (no production effect; tags carry the objects off-machine)

```bash
cd /home/divas/Documents/GitHub/sahodalabs          # primary; stays on feat/admin-ops for now
git tag archive/wt-web-cb10128    cb10128           # unpushed local wt-web tip
git tag archive/wt-db-tip         wt-db
git tag archive/sites-wip         sites-wip         # 696-line SiteStore port, abandoned
git tag archive/feat-admin-ops    feat/admin-ops
git tag archive/branch-63afdee    branch            # holds the unique 430-line platform mock
git tag archive/local-main        main              # the bogus "Initial commit" root
git tag archive/origin-main       origin/main
git tag archive/origin-wt-obs     origin/wt-obs     # "zxzX" — verified tree-identical to 6778ec5
git tag archive/backup-855e00a    backup/pre-deploy-fix-855e00a
git tag archive/stash-0 'stash@{0}'
git tag archive/stash-1 'stash@{1}'
git push origin --tags
git ls-remote --tags origin | grep -c 'refs/tags/archive/'
```

**GATE (owner addition): the count above must be exactly `11`. Do not proceed on any other
number.** (Tags deploy nothing — Vercel builds on branch pushes only.)

```bash
# Salvage ignored-but-unique files (worktree remove deletes ignored files SILENTLY —
# the dirty-check does NOT protect them):
cp -p .claude/worktrees/wt-obs/apps/web/.env.local ~/sahoda-salvage-env.local   # NEVER commit
tar czf ~/sahoda-remember-lanes.tgz \
  .claude/worktrees/wt-pub/.remember .claude/worktrees/wt-mesh/.remember \
  .claude/worktrees/wt-billing/.remember .claude/worktrees/wt-db/.remember
```

**Predicted:** 11 tags created, 11 on origin, salvage file 3,700 B mode 0600, tarball created.
**STOP. Report.**

---

## PRE-PHASE-1 GATE (owner addition): the `packages/db/corrections/` report

Before Phase 1 commits that directory, the owner must have seen: what the hand-written GRANT at
ledger seq 5374 was, whether the compensating correction was applied, and whether the workspace's
current balance is arithmetically correct. (Delivered with the Phase 0 report, from read-only
SQL: seq 5374 GRANT +100 mislabelled `signup_grant`; correction pair seq 5596/5597 applied
2026-07-25, net zero, +100 first; balance 26 = 200 GRANT + 0 ADJUST − 174 DEBIT, matches
`credit_balances.balance_total` and the last `balance_after`; `balance_held` 0 with HOLD Σ ==
DEBIT Σ. The script itself contains no credentials.)

---

## PHASE 1 — COMMIT THE UNCOMMITTED (three worktrees hold work that exists in no commit)

```bash
cd .claude/worktrees/wt-web       # 9 dirty files = NEWEST scrubber work
git diff                          # review, then:
git add -u
git commit -m "obs: scrubber + verify-sentry refinements (supersedes ff806db, stash@{1})"
```
Do **NOT** cherry-pick `ff806db` or apply `stash@{1}` afterwards — three patch-ids, this is newest.

```bash
cd ../wt-db                       # ~196 uncommitted lines + corrections/ (verified: no secrets)
git add LEARNINGS.md packages/db/seeds packages/db/tests packages/db/corrections   # explicit paths, never -A
git commit -m "wip(db): demo-seed evolution + ledger-correction script (rescued from worktree)"
git tag archive/wt-db-wip HEAD && git push origin archive/wt-db-wip
```

```bash
cd ../wt-admin                    # 2 dirty files
git diff && git add -u && git commit -m "test(webhooks): clerk route test + board sync"
git push origin wt-admin          # PREVIEW deploy only — updates PR #4; cannot touch production
```

**Predicted:** three commits; all three worktrees clean (`status --porcelain` empty except
ignored); origin tag count becomes 12. **STOP. Report.**

---

## PHASE 2 — BUILD THE TRUNK LOCALLY (nothing deploys until Phase 3)

All in `.claude/worktrees/wt-web`.

**2.0 (owner addition) — R-01 guard is the FIRST commit, then PROVE it.**
Implement `04-risks-and-unknowns.md` §R-01 steps 1–5: `SAHODA_ALLOW_LIVE_TESTS=1` opt-in gate in
`packages/db/tests/helpers/env.ts`, `apps/jobs/tests/helpers/env.ts`, a shared billing helper for
the 4 integration suites, plus `turbo.json` `test.env: ["SAHODA_ALLOW_LIVE_TESTS"]`. Commit.
**Proof, not green:** run the db suite through turbo WITHOUT the flag and show every live suite
SKIPPED (0 DB writes — verify `credit_ledger` count unchanged via read-only SQL before/after);
predicted `@sahoda/db: 9 passed | 96+ skipped` with `tests/ledger.test.ts` **skipped**.

**2.1 — merge wt-admin, with the conflict set re-verified first:**
```bash
git merge-tree --write-tree wt-web wt-admin    # acceptable conflict set: EXACTLY
                                               # apps/web/src/middleware.ts + turbo.json
git merge --no-ff wt-admin
```
Resolution rules — no others permitted without a stop-and-report:
- `middleware.ts` → UNION: public routes keep `/api/cron/sweeps` (exact path) AND
  `/api/admin/devops/ingest`; keep `isAdminRoute('/admin(.*)','/api/admin/(.*)')` gating.
- `turbo.json` → UNION of both env arrays.
- `secret-values.ts` merged result must retain wt-admin's three additions:
  `DEVOPS_INGEST_TOKEN`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`.
- `pnpm-lock.yaml` if it conflicts: `git checkout --theirs pnpm-lock.yaml && pnpm install
  --lockfile-only`. Never hand-edit.

**(owner addition)** Immediately after resolving: write `apps/web/src/middleware.test.ts` pinning
all three behaviours — cron route excluded from auth, public routes public, `/admin` gated —
and commit it WITH the merge. Nothing else tests this file.

**2.2 — gate (now safe by construction):** `pnpm install --frozen-lockfile`, then
`pnpm turbo run typecheck test --force`.
Structural tripwire (counts shift post-merge — wt-admin adds 7 live db test files):
`@sahoda/db` passed stays single-digit-to-low-teens with a LARGE skip count; ANY
ledger/rls/ops_*/*.integration test EXECUTING with network-scale durations = guard failed,
production was written → **STOP**.

**2.3 — env-union verification:** `pnpm turbo run build --dry=json` must list BOTH sides:
`TURNSTILE_SECRET_KEY`, `ADMIN_BOOTSTRAP_EMAILS`, `DEVOPS_INGEST_TOKEN` AND `SENTRY_AUTH_TOKEN`,
`SAHODA_PUBLISH_DISPATCH_MODE`. Then `vercel env ls` → the three admin vars must exist in the
**production** scope (their preview success proves nothing).

**2.4:** `git cherry-pick cd2053c` (verified conflict-free). Then dedupe `LEARNINGS.md` once
(union driver duplicates on merge) as a chore commit. Re-run the 2.2 gate in full.

**2.5 (owner addition) — the seq-5374 ledger correction must be readable from trunk.**
`archive/wt-db-wip` preserves the script, but wt-db is abandoned in Phase 5 and nobody audits an
archive tag. Write `docs/incidents/2026-07-24-manual-grant-seq-5374.md` on the trunk recording:
what happened on 24 July (hand-written GRANT +100 mislabelled `signup_grant`, rendered to the
user as "Plan credits"), the compensating pair seq 5596/5597 applied 2026-07-25 (+100 first, net
zero), the three-way reconciliation (200 − 174 + 0 = 26 == `credit_balances` == last
`balance_after`; HOLD Σ == DEBIT Σ, held 0), and the resolution, with the full correction script
inline as a code block (docs/ is outside every package tsconfig — no build impact). Commit it as
its own `docs:` commit.

**Predicted:** conflict set exactly {middleware.ts, turbo.json}; full gate green with large skip
counts; env union present. **STOP. Report.**

---

## PHASE 3 — THE ONE DELIBERATE PRODUCTION DEPLOY  ⛔ HARD STOP — needs explicit go-ahead

```bash
git log --format='%an' origin/wt-web..HEAD | sort -u    # must print ONLY: SAHODALABS
git push origin wt-web        # → PR #4 flips to Merged; → Vercel builds PRODUCTION
```

**MANDATORY, NON-SKIPPABLE probe matrix** (nothing but the new middleware test pins this file;
these probe the deployed truth). Expectations below are CORRECTED against the measured
production baseline and the verified preview run of 2026-07-28 — the earlier draft predicted
`/admin → 3xx`, which was wrong: doc 13 §2 requires a plain 404 so an anonymous scanner learns
nothing, and `middleware.ts` implements exactly that via `notFound(csp)`.

```bash
B=https://sahodalabs.vercel.app          # or the preview URL
curl -s -o /dev/null -w '%{http_code}\n' $B/                        # 404 — PRE-EXISTING, no root page; matches prod
curl -s -o /dev/null -w '%{http_code}\n' $B/sign-in                 # 200
curl -s -o /dev/null -w '%{http_code}\n' $B/api/cron/sweeps         # 401 — NOT 3xx (cron must not be redirected)
curl -s -o /dev/null -w '%{http_code}\n' $B/admin                   # 404 — the gate, NOT 3xx, NOT 200
curl -s -o /dev/null -w '%{http_code}\n' $B/api/admin/devops/ingest # 405 — route reached, GET not allowed; NOT 3xx, NOT 404
curl -s -o /dev/null -w '%{http_code}\n' $B/embed/beta              # 200 post-merge (404 = the admin surface did not deploy)
```

**`/admin` → 404 is ambiguous on its own** — it is also what you get when the route does not
exist at all (which is what production returns today, since wt-admin has never been deployed
there). Disambiguate with `/embed/beta`: it comes from the same merge and is genuinely public,
so **200 proves the admin/ops code shipped** and the `/admin` 404 is therefore the gate refusing
an anonymous caller, not a missing route.

**Fail conditions — any of these means roll back immediately:** a 3xx anywhere a 401/403/404 is
listed; `/admin` returning 200 to an anonymous caller; `/api/cron/sweeps` returning anything but
401; `/embed/beta` returning 404 after the merge.

**(owner addition)** If ANY probe returns 3xx where 401/403 is expected: **immediately roll back
in the Vercel dashboard to `dpl_5UUThQdJDwgPKWggcyo2Kgrj1oX9` (wt-web@71610dc) and stop. Do NOT
git-revert first.** Rollback restores code only — migrations and PR state remain.

Soak 2–24 h. **STOP. Report.**

---

## PHASE 4 — REPAIR `main` BY TREE ADOPTION (a working-tree merge is proven to conflict on 10 files)

```bash
cd /home/divas/Documents/GitHub/sahodalabs
mv docs/design2.0 /tmp/design2.0-dup       # untracked here, TRACKED on wt-web, byte-identical — blocks the ff otherwise
git checkout main && git reset --hard origin/main      # discards bogus root (kept as archive/local-main)
M=$(git commit-tree 'wt-web^{tree}' -p main -p wt-web \
    -m "merge: adopt trunk (origin/main tree == wt-web@413a252 tree; docs/audit/2026-07-27)")
git merge --ff-only "$M"
git diff main wt-web --stat                # EMPTY BY CONSTRUCTION — anything else is a full stop
git push origin main                       # MUST precede the flip — inverted order arms deploying a 36-behind tree
# Vercel → Settings → Git → Production Branch: wt-web → main   (no-op deploy: identical tree)
#   After the flip, pushes to wt-web NO LONGER deploy production; all fixes go to main.
# GitHub → protect main, require PR. NO required status check until the CI workflow exists.
git add docs/audit && git commit -m "docs: 2026-07-27 audit + reconciliation runbook" && git push
```

**Predicted:** ff succeeds; diff empty; flip is a no-op deploy. **STOP. Report.**

---

## PHASE 5 — DELETE, IN DEPENDENCY ORDER  ⛔ HARD STOP — needs explicit go-ahead

```bash
for wt in wt-pub wt-mesh wt-obs wt-billing wt-db; do
  git -C .claude/worktrees/$wt status --porcelain      # must be EMPTY (Phase 1 committed wt-db)
  git worktree remove .claude/worktrees/$wt            # NO --force — a refusal is a finding
done
git worktree prune
git branch --unset-upstream wt-obs wt-billing          # -d checks merged-into-UPSTREAM; both are 'ahead' of stale remotes
git branch -d wt-pub wt-mesh wt-obs wt-billing         # -d = git re-proves containment; refusal = STOP
git branch -D wt-db sites-wip feat/admin-ops branch    # unique tips: every one tagged in Phase 0/1
git ls-remote --tags origin | grep -c 'refs/tags/archive/'   # must be 12 before touching the remote
git push origin --delete wt-pub wt-mesh wt-billing wt-db branch wt-obs
git stash drop 'stash@{1}' && git stash drop 'stash@{0}'     # both tagged; both superseded by Phase 1
```

KEEP: `wt-admin` (branch + worktree) until PR #4 shows Merged and the soak is clean;
`backup/pre-deploy-fix-855e00a` until CI exists. Optional later:
`git show archive/branch-63afdee:docs/sahoda_platform_mock.html > docs/sahoda_platform_mock.html`.

### ⚠️ 5.7 — RE-ENABLE THE STOP HOOK. Do not close Phase 5 without this.

The repo's `Stop` hook (`.claude/settings.json`) runs
`pnpm turbo run typecheck test --filter="...[origin/main]"` and refuses to let a session end on
a red gate. That is correct in normal operation and **wrong during phase-gated execution**,
where a red gate is an expected checkpoint requiring an owner decision — it fired on 2026-07-28
and tried to force a fix the owner had explicitly reserved for themselves.

It was disabled for the duration of this runbook, **parked verbatim** (not deleted) under the
key `_Stop_DISABLED_2026-07-28_reenable_in_phase5` in `.claude/settings.json`. Re-enabling is a
rename back to `Stop`, not a rewrite:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('.claude/settings.json')
d = json.loads(p.read_text())
d['hooks']['Stop'] = d['hooks'].pop('_Stop_DISABLED_2026-07-28_reenable_in_phase5')
p.write_text(json.dumps(d, indent=2) + '\n')
PY
git -C . diff --stat .claude/settings.json     # confirm the key is back to "Stop"
```

Verify with `python3 -c "import json;print(list(json.load(open('.claude/settings.json'))['hooks']))"`
— the output must contain `Stop` and no `_Stop_DISABLED_*` key.

**Predicted:** five worktrees removed without refusal; `-d` succeeds for all four contained
branches; remote deletions only after the tag count reads 12. **STOP. Report.**

---

**End state:** `main` == production == the full trunk; exactly one production deploy, gated,
probed, with a named rollback; every abandoned object reachable from a pushed `archive/*` tag;
zero uncommitted work anywhere.
