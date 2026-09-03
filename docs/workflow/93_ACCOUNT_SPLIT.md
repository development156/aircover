# Splitting six lanes onto a second Claude Max account

Companion to [91_ACCOUNT_MIGRATION.md](91_ACCOUNT_MIGRATION.md), which covers
MOVING an account. This one covers SPLITTING, with both accounts live at once.

**Account A keeps** `wt-divas{,2,3}` and `wt-karunesh{,2,3}` and stays the sole
integrator into `wt-core`. **Account B takes** `wt-girija{,2,3}` and
`wt-jiban{,2,3}` and never merges into the trunk.

Rendered guide, same content: <https://claude.ai/code/artifact/a8e100f2-04d7-4135-a8b2-2bfa7e34af4c>

---

## 1 · What actually moves

Nothing in the repository knows which Claude account a session runs under. There
is no lane setting to change and no branch to transfer. What has to be arranged
is who can push, who owns which lane, and who may integrate.

| Thing | Travels? | What you do |
| --- | --- | --- |
| The six branches | already there | nothing; both accounts can already see them |
| commands, agents, skills, `.githooks` | yes, with the clone | nothing; all tracked |
| push access | no | invite Account B's GitHub user as a collaborator |
| **commit author** | no | **must be forced to `SAHODALABS`** — see §2 |
| lane ownership | no | `git config sahoda.owner`, set by `/kickoff` |
| `~/.claude/rules/ecc/**` (21 files) | no | `scripts/account-export.sh` captures them |
| plugins, marketplaces, MCP auth | no | per account; re-install and `/mcp` |
| `apps/web/.env`, `.env.local` | never | move by hand |

## 2 · The rule that will bite you

**Vercel refuses to build a commit that is not authored `SAHODALABS`.** The push
succeeds, GitHub accepts it, and no preview deployment is ever produced. Nothing
errors; the lane just stops having a link, which is the one thing the founder's
reporting rule requires after every change.

MEASURED 2026-07-25: `a5f32c3`, authored `IDIVASM`, was BLOCKED. The identical
tree re-authored as `SAHODALABS` (`24e46d0`) went READY.

So separate the two identities. Account B's operator **pushes** with their own
GitHub login, which keeps the audit trail honest, and every commit is **authored**
`SAHODALABS`. Vercel checks the author, not the pusher.

**Setting the author is itself a trap.** This repo has
`extensions.worktreeConfig = true`, so a new worktree is born with a per-worktree
config shadowing the repo-level author. Plain `git config user.name` writes the
repo file, reads back the old value, and reports success — which is how the
blocked commit above got made.

```bash
# in EVERY worktree, not just the first
git config --worktree user.name  "SAHODALABS"
git config --worktree user.email "development@sahodalabs.com"
git var GIT_AUTHOR_IDENT          # the value Vercel will see
```

## 3 · Setting up Account B

```bash
# ── Account A, once ──────────────────────────────────────────────────────────
bash scripts/account-export.sh      # 21 rule files + plugin list, credential-scrubbed
# then hand over apps/web/.env and apps/web/.env.local out of band

# ── Account B ────────────────────────────────────────────────────────────────
claude                              # sign in as the second account
git clone https://github.com/development156/aircover.git
cd aircover && git checkout wt-core && pnpm install
bash scripts/account-import.sh

git config core.hooksPath .githooks          # NOT optional — see below
git config --worktree user.name  "SAHODALABS"
git config --worktree user.email "development@sahodalabs.com"
# put the two .env files back · run /mcp · re-install the listed plugins

for L in wt-girija wt-girija2 wt-girija3 wt-jiban wt-jiban2 wt-jiban3; do
  git worktree add ".claude/worktrees/$L" "$L"
  git -C ".claude/worktrees/$L" config --worktree user.name  "SAHODALABS"
  git -C ".claude/worktrees/$L" config --worktree user.email "development@sahodalabs.com"
done

bash scripts/account-verify.sh      # exits non-zero if anything is missing
```

`core.hooksPath` without it, the push guard that keeps a lane out of `wt-web` and
`main` is simply off. It was found unset in a live worktree on 2026-08-28: the
guard had been built, tested, and then silently not armed.

**Give every lane its own `E2E_PORT`.** Six worktrees on one machine all default
to 3100, and Playwright's `reuseExistingServer` silently attaches to whatever is
already listening. One lane once tested another lane's build twice and nearly
reported it as its own.

## 4 · Who may do what

The push guard reads `git config sahoda.owner`, not the branch you stand on,
because a cloud session can move you to a `claude/...` branch you did not choose.
It currently lets `divas`, `jiban` AND `girija` write `wt-core` — so the split
needs a rule the hook does not enforce.

| Action | Account A | Account B |
| --- | --- | --- |
| push its own six lanes | yes | yes |
| merge lanes into `wt-core` | yes, sole integrator | **no** (convention, not a hook) |
| push `wt-web` or `main` | no | no |
| apply a migration to production | yes, deliberately | no — write the file, hand it over |
| run the `@smoke` suite | one at a time, by agreement | one at a time, by agreement |
| execute a real publish | never | never |

Account B finishes a lane by pushing it and saying so in its handoff; Account A
pulls it into `wt-core`.

## 5 · What breaks when two accounts run at once

- **One production database, no staging.** `rloztdhzfliyvpvxsgjl` holds real
  customers and both accounts write to it. The `@smoke` suite does not read, it
  CREATES. One run at a time, announced first. The refusal without
  `SAHODA_E2E_ACK_TARGET` stays. The durable fix is a Supabase branch.
- **Migration numbers collide.** Three files once shared `20260821000000`. Only
  Account A applies anything. Never `supabase db push`.
- **A lane moves under you.** Assert containment before overwriting anything, and
  merge whatever moved rather than forcing past it:
  `git merge-base --is-ancestor origin/$L wt-core || echo "MOVED: $L"`.
  A rejected non-forced push is the signal working.
- **Two handoffs, one filename.** `<owner>-<lane>-<date>.md`, both halves
  load-bearing, unchanged by the split.

## 6 · Proving it works

1. `git var GIT_AUTHOR_IDENT` reads `SAHODALABS` in **every** worktree.
2. `git config core.hooksPath` reads `.githooks`, and a deliberate
   `git push origin HEAD:main` is REFUSED. A guard never shown to fail is not a guard.
3. **Push a one-line change to `wt-girija` and confirm a Vercel deployment appears**
   at `https://sahodalabs-git-wt-girija-development-4417s-projects.vercel.app`.
   If nothing appears, that is §2 and every Account B lane is invisible until fixed.
4. `pnpm turbo run typecheck lint test` and `pnpm format:check` both green.

## What this does not solve

Both accounts hold the same production secrets, so a leak's blast radius doubles,
and the database password from the QA-log leak is still unrotated in a public
repository's history. And `wt-core` has never been promoted to `wt-web`, so
neither account's work is what customers see.
