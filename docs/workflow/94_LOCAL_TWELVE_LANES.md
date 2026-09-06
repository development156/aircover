# Twelve lanes, one machine

The lanes are no longer split across accounts or cloud sessions. One person, one
laptop, one Claude account, twelve worktrees. This is how that is set up and what
it will and will not do.

Supersedes the arrangement in [93_ACCOUNT_SPLIT.md](93_ACCOUNT_SPLIT.md), which
described moving six lanes to a second account. That was decided against.

## Setting up, and re-checking

```bash
bash scripts/lane-setup-local.sh          # create what is missing, fix what is wrong
bash scripts/lane-setup-local.sh --check  # verify only; exits non-zero if not ready
```

Idempotent. It never deletes a worktree, never installs dependencies, and never
moves a branch. Run `--check` at the start of any session you are unsure about.

## What each lane gets, and why

| | Why it matters |
| --- | --- |
| its own worktree | nine of the twelve had none |
| author `SAHODALABS`, **`--worktree` scoped** | Vercel REFUSES to build a commit authored anything else, silently. The lane stops producing previews and nothing errors. |
| `core.hooksPath=.githooks` | without it the push guard is off |
| `sahoda.owner` / `sahoda.lane`, **`--worktree` scoped** | the push guard reads `sahoda.owner` to decide who may write `wt-core` |
| a private `E2E_PORT` | every worktree defaults to 3100 and Playwright's `reuseExistingServer` attaches to whatever is already listening |

**Both scoped settings must be `--worktree`.** This repo has
`extensions.worktreeConfig = true`, so a plain `git config` writes the SHARED file
that every worktree reads. Twelve lanes writing one key leaves whichever ran last.
That is not cosmetic: it was observed setting every lane to `owner=divas` while the
shared key said `karunesh`, which would have let a karunesh lane push the trunk.

## The ports

| lane | port | | lane | port |
| --- | --- | --- | --- | --- |
| wt-girija | 3201 | | wt-divas | 3207 |
| wt-girija2 | 3202 | | wt-divas2 | 3208 |
| wt-girija3 | 3203 | | wt-divas3 | 3209 |
| wt-jiban | 3204 | | wt-karunesh | 3210 |
| wt-jiban2 | 3205 | | wt-karunesh2 | 3211 |
| wt-jiban3 | 3206 | | wt-karunesh3 | 3212 |

3100 is deliberately unused: it is the unset default, so a lane that loses its
`E2E_PORT` collides with nothing rather than silently joining another lane.

If a server's identity is ever in doubt, `readlink /proc/<pid>/cwd` says which
worktree it belongs to.

## Dependencies are per lane and are not installed for you

About 1.1 GB each. Install only the lane you are about to work in:

```bash
cd .claude/worktrees/<lane> && pnpm install
```

A lane with no `node_modules` cannot run a gate. `--check` lists which those are.

## How many at once

**Three or four, not twelve.** 15 GB of RAM, and a dev server plus a gate is
roughly 2 GB a lane. Twenty-two kernel OOM kills were recorded in three hours with
FOUR sessions running, and an OOM kill surfaces as a failed gate rather than as an
out-of-memory message — so a red gate that makes no sense is worth one check:

```bash
journalctl -k | grep -i oom
```

Disk is the other ceiling: 39 worktrees already hold about 53 GB with roughly
60 GB free. The 27 that are not one of the twelve lanes are finished work; their
`node_modules` can be deleted to reclaim space and `pnpm install` rebuilds them.

## Who may push what

Unchanged by going local, and enforced by `.githooks/pre-push`, which reads
`sahoda.owner` rather than the branch you are standing on.

| | |
| --- | --- |
| `wt-web`, `main` | no lane, ever. `wt-web` is the live product. |
| `wt-core` | **`divas` only.** Closed to `girija`, `jiban`, `karunesh` and to an unset owner. Everyone else PULLS `wt-core` into their lane. Founder's ruling, 6 September 2026. |
| its own lane | always |

Promotion out of `wt-core` costs a typed sentence:
`SAHODA_PROMOTE=wt-web git push origin wt-core:wt-web`

**Test the hook by driving it directly, not with `git push --dry-run`** — git
rejects a non-fast-forward before the hook's verdict matters, so a dry run can
look like the guard working when it never ran:

```bash
echo "refs/heads/wt-girija $(git rev-parse HEAD) refs/heads/wt-core $(git rev-parse HEAD)" \
  | .githooks/pre-push origin x ; echo "exit=$?"   # must be 1
```

## What is still shared, and still dangerous

One production database, `rloztdhzfliyvpvxsgjl`, with no staging. Every lane on
this machine writes to it. The `@smoke` suite does not read, it CREATES: each spec
mints a Clerk user, signs in, lets the app build a workspace and a credit ledger,
then deletes them.

**One smoke run at a time.** The refusal without `SAHODA_E2E_ACK_TARGET` stays.
The durable fix is a Supabase branch for testing, which gets its own ref and needs
no acknowledgement.

## Account-scoped things, if you ever move again

These do not travel with a clone and are not in git: `~/.claude/rules/ecc/**`,
installed plugins and private marketplaces, MCP authorisations, and
`apps/web/.env*`. `scripts/account-export.sh` captures the first two.
[91_ACCOUNT_MIGRATION.md](91_ACCOUNT_MIGRATION.md) is the full procedure.

The Supabase MCP is currently unauthorised on this account. It is not a blocker:
production queries go through a Node script that reads `SUPABASE_DB_URL` from the
env file and connects with `pg` directly, which is how the migration backlog was
audited and applied.
