# 36 — Worktree cleanup

**Measured 2026-08-22.** Nothing here has been removed. The lists say what is safe
and what is not; the decision is the founder's.

## Why this exists

```
89   .env-shaped files under .claude/worktrees/
70   of them carry at least one live secret
69   worktrees hold a copy
```

Per-secret copy count:

| secret | copies on this disk |
|---|---|
| `CLERK_SECRET_KEY` | 70 |
| `TOKEN_VAULT_KEY` — decrypts every stored OAuth token | 70 |
| `OPENROUTER_API_KEY_TEXT` | 70 |
| `SUPABASE_SERVICE_ROLE_KEY` — bypasses all RLS | 69 |
| `CASHFREE_SECRET_KEY` — production payment credential | 69 |
| `SUPABASE_JWT_SECRET` — mints any user's session | 69 |
| `CLOUDFLARE_API_TOKEN` | 69 |
| `RESEND_API_KEY` | 69 |
| `ZERNIO_API_KEY` | 61 |

Most are from lanes that finished weeks ago. Every one is a full-privilege copy:
`SUPABASE_JWT_SECRET` alone is enough to mint a token for any user in production,
as `packages/db/scripts/rls-live-matrix.mjs` does deliberately.

Deleting worktrees reduces the count. It does not rotate anything — **any secret
that has ever been on a shared or backed-up disk should be rotated on its own
schedule**, and that is a separate founder action.

## The classification

76 worktrees. "Merged" means `git rev-list --count wt-integrate2..<branch>` is 0.
"Dirty" is `git status --porcelain` in that worktree.

| group | count | meaning | safe to remove? |
|---|---|---|---|
| A · orphan, clean | 2 | pre-squash history, no merge-base with the current root, working tree clean | **yes** |
| B · merged, clean | 36 | every commit is in `wt-integrate2`, nothing uncommitted | **yes** |
| C · merged, dirty | 14 | commits merged, but uncommitted files remain | **inspect first** |
| E · orphan, dirty | 4 | pre-squash, and uncommitted work that may exist nowhere else | **inspect first** |
| D · unmerged | 20 | commits `wt-integrate2` does not have | **no** |

### A — pre-squash orphans, clean (2)

`wt-mesh` `wt-obs`

These share **no merge-base** with `wt-integrate2`. The 2026-08-07 history reset
gave the repository a new root, so their commit counts (110 and 134) are the old
history, not unmerged work — their content reached `wt-web` before the reset.
A count of "134 ahead" here means nothing at all, which is exactly why this
document classifies by merge-base rather than by `rev-list`.

### B — merged and clean (36)

```
wt-composer  wt-conn      wt-db2       wt-design    wt-editor2   wt-fix-camp
wt-fix1      wt-flow      wt-gate      wt-health    wt-hide      wt-hollow
wt-ia        wt-inbox3    wt-inbox4    wt-ingest    wt-integrate wt-limits
wt-loop      wt-loose-ends wt-metrics  wt-money     wt-onboard   wt-onboard2
wt-playbooks wt-qa        wt-qafix     wt-realtime  wt-redesign  wt-screens
wt-signal    wt-status    wt-ui-port   wt-ux        wt-zernio
```

**`wt-integrate2` is in group B by the arithmetic and must NOT be removed** — it is
the integration branch every current lane is cut from. It appears here only
because a branch is trivially merged into itself. Removing it is the one entry
on this page that would cost real work.

### The command

```bash
cd /home/divas/Documents/GitHub/sahodalabs

# Look before deleting: this prints what each holds. Run it first.
for b in wt-mesh wt-obs wt-composer wt-conn wt-db2 wt-design wt-editor2 \
         wt-fix-camp wt-fix1 wt-flow wt-gate wt-health wt-hide wt-hollow \
         wt-ia wt-inbox3 wt-inbox4 wt-ingest wt-integrate wt-limits wt-loop \
         wt-loose-ends wt-metrics wt-money wt-onboard wt-onboard2 wt-playbooks \
         wt-qa wt-qafix wt-realtime wt-redesign wt-screens wt-signal wt-status \
         wt-ui-port wt-ux wt-zernio; do
  echo "$b: $(git -C .claude/worktrees/$b status --porcelain | wc -l) uncommitted"
done

# Then remove. NOT --force: without it, git refuses any worktree that turns out
# to be dirty, which is the last check between this list and lost work.
for b in <the same list>; do git worktree remove .claude/worktrees/$b; done

git worktree prune
```

The branches are deliberately left behind. `git worktree remove` deletes the
directory and its `.env`; the branch ref costs nothing and is the only way back
if a lane turns out to have been needed.

**Do not add `--force`.** These were measured clean at 2026-08-22 15:50 IST; a
session running now can dirty one between that measurement and the command, and
`--force` is precisely what would delete it silently.

## Must NOT be removed

### D — unmerged (20), with what each still holds

| branch | commits ahead | files differing |
|---|---|---|
| `wt-knowledge` | 14 | 53 |
| `wt-media` | 10 | 37 |
| `wt-webhooks` | 10 | 33 |
| `wt-money2` | 8 | 74 |
| `wt-remix` | 7 | 55 |
| `wt-radar-ui` | 7 | 32 |
| `wt-ops` | 6 | 27 |
| `wt-pay2` | 6 | 10 |
| `wt-radar` | 6 | 39 |
| `wt-pay` | 5 | 16 |
| `wt-merge-map` | 4 | 1 |
| `wt-audit` | 3 | 49 |
| `wt-db3` | 3 | 6 |
| `wt-journey` | 3 | 1 |
| `wt-tours` | 3 | 21 |
| `verify/camp-composer` | 3 | 65 |
| `wt-handoff` | 2 | 1 |
| `wt-shots` | 2 | 42 |
| `wt-journey2` | 1 | 1 |
| `wt-ops-export` | 1 | 16 |

`wt-db3` matters beyond its size: two migrations applied to production exist as
files **only** on it. See docs/35 §migration record.

### C and E — dirty, so the work may exist nowhere else (18)

A lane can hold its entire output uncommitted; `git merge` then succeeds having
merged nothing. Four of these hold more than 100 uncommitted paths:

| branch | uncommitted paths | group |
|---|---|---|
| `wt-audit` | 117 | D, also unmerged |
| `wt-assets` | 115 | C |
| `verify/camp-composer` | 114 | D, also unmerged |
| `wt-camp` | 114 | C |
| `wt-audience` | 111 | C |
| `wt-brain` | 69 | C |
| `wt-alpha` | 68 | C |
| `wt-collect` | 66 | C |
| `wt-brainui` | 61 | C |
| `wt-analytics2` | 59 | C |
| `wt-admin` | 52 | E |
| `wt-billing` | 34 | E |
| `wt-db` | 21 | E |
| `wt-themes` | 18 | C |
| `wt-inbox2` | 17 | C |
| `wt-analytics` | 13 | C |
| `wt-web` | 11 | C |
| `wt-pub` | 10 | E |
| `wt-ui-compare` | 1 | C |
| `wt-inbox` | 1 | C |

Much of this will be build output and screenshots rather than source. The check
that settles it, per branch:

```bash
git -C .claude/worktrees/<branch> status --porcelain | grep -vE '\.(png|jpg|log)$|^\?\? (node_modules|\.next|test-results|playwright-report)/'
```

Anything left is a candidate for a commit on its own branch before the worktree
goes. The four E entries deserve the most care: their branches predate the
history reset, so uncommitted work there may not exist in any post-reset branch.

## What this document cannot tell you

- **Whether a "merged" lane's work is actually live.** Merged into `wt-integrate2`
  is not the same as deployed: production builds from `origin/wt-web`, which on
  2026-08-22 was 8 days behind and carried one cron route where the integration
  branch carries three.
- **Whether an untracked file matters.** It counts paths; it does not read them.
- **Whether a secret has already leaked.** It counts copies on this disk. It says
  nothing about backups, previous machines, or anywhere a file was ever copied to.
