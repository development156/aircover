# 09 · Cloud sessions

**For A2 and A3, who work in Claude Code cloud sessions rather than local
worktrees.** A1 works locally and should read `04_PARALLEL_SESSIONS.md` instead.

Written 24 August 2026. The branch topology below was measured; re-measure it
before trusting this file, because it is the part most likely to go stale.

---

## The one thing that will silently ruin a week

**Do not cut a branch from `main`. Any `main`.**

| Ref | Date | Routes | Behind `wt-web` |
|---|---|---|---|
| **`origin/wt-web`** | 2026-08-24 | **58** | **0** |
| `origin/main` | 2026-08-07 | 20 | 692 |
| `idivasm/main` | 2026-08-23 | 11 | 693 |
| `idivasm/wt-web` | 2026-08-05 | 20 | 693 |

`main` is the root commit the trunk was rebuilt on after the August history
reset. It was never advanced. **A branch cut from it is a 20-route skeleton of a
58-route product**, with no current design system in `docs/`, and a pull request
from it is unmergeable in any useful sense.

`.claude/commands/fix.md` step 1 still says *"Create a branch from
`origin/main`"*. That instruction predates the reset and is wrong. Until it is
corrected, **cut from `origin/wt-web`** and say so in the pull request.

---

## The repository is `development156/sahodalabs`

There are two GitHub remotes and they are not mirrors.

| | `development156/sahodalabs` | `IDIVASM/sahodalabs` |
|---|---|---|
| Current product | **yes** | no — 693 commits behind |
| Vercel project | **yes** | **none attached** |
| Preview URL per branch | **yes** | **no** |

The single Vercel project `prj_L4IDks4bMlBwObyKcHzej6lVqm9D` links to
`{org: development156, repo: sahodalabs}` and nothing else. Its last twenty
deployments cover `wt-web`, `wt-sec`, `wt-handoff`, `wt-loop` and
`squashed-root` — **every branch pushed there gets a preview**, aliased at:

```
https://sahodalabs-git-<branch>-development-4417s-projects.vercel.app
```

A branch pushed to `IDIVASM/sahodalabs` gets no preview at all. For A2 that is
not an inconvenience, it is the whole visual feedback channel.

**So both collaborators need write access to `development156/sahodalabs`.**
That is a GitHub permission the founder grants; nothing in this repository can
work around it.

---

## Starting a session

```
Repository:  development156/sahodalabs
Base branch: wt-web            ← never main
Your branch: whatever this session assigns you. That IS your lane.
Your work goes to: wt-core     ← the one gated step is wt-core -> wt-web
```

**First four commands, every session, in order:**

```bash
git fetch --all --prune
git branch --show-current      # this is your lane. Do not rename it.
git pull --ff-only origin "$(git branch --show-current)"
git branch --show-current                    # VERIFY — never assume a checkout succeeded
find apps/web/src/app -name page.tsx | wc -l # 58 = the product, ~20 = a stale main
pnpm install
```

**Pull every single session.** Three lanes and an integration branch move
independently; a session that starts stale writes against code that no longer
exists. `--ff-only` is deliberate: if it refuses, your lane has diverged and you
should find out why rather than let a merge happen by accident.

The third line is not ceremony. A session in this project once ran an unguarded
`git checkout -B`, the switch failed silently, and a six-way trial merge ran on
the branch it was already standing on — during a task that explicitly said *do
not merge*. The reflog caught it. **Verify after every checkout.**

Then `/kickoff`, which reads the other roles' most recent handoffs before you
plan anything.

---

## Credentials

**The founder supplies `.env` and it is production.** Supabase, Clerk, Cashfree,
Zernio and OpenRouter, against ref `rloztdhzfliyvpvxsgjl`. There is no staging
and there is no second net.

That was ruled on deliberately on 24 August 2026 after the alternative was put.
It is settled. What it obliges you to do:

- **Never run `supabase db push`.** Not once, not to check something.
- **Never `DROP`, `TRUNCATE`, or `DELETE`/`UPDATE` without a `WHERE`** against
  any table holding real data.
- **Never execute a publish.** It posts to a real customer's feed.
- **Clean up any row you create, and count rows afterwards.** The E2E suite in
  this repository wrote to the production database on every gate run for months
  and minted **12,196 Clerk users** before anyone noticed, because a cleanup
  function returned silently when a key was absent.
- `SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl` is **required** or Playwright
  refuses at module scope. That guard exists because of the above. Do not
  remove it, and do not treat its refusal as a bug.

**If the sandbox turns out not to accept `.env` at all** — the cloud sandbox is
documented in `CLAUDE.md` as having none by design, and live-database tests skip
themselves there — that is not a failure to fix. Work from the Vercel preview
instead; it is a real deployment of your real branch against real
infrastructure. Never invent credentials to un-skip a skipped test.

---

## Seeing your work

**The preview URL is the visual channel, and it is honest** — a real build of
your branch on real infrastructure, which a local dev server is not.

```
push  →  Vercel builds  →  https://sahodalabs-git-<branch>-…vercel.app
```

**It costs two to four minutes per iteration.** For A2 that is the real
constraint of working in a cloud session, more than any credential question. So:

- **Batch a screen, not a nudge.** Ten small pushes to move a padding value
  will waste an hour. Make the whole change, then look.
- **Capture three widths: 390, 1024, 1440.** Not two. `md:` `sm:` `lg:` compile
  to nothing in this repository — the real breakpoints are **700 and 1180**, so
  390 and 1440 both land in terminal bands and neither exercises 700–1179. A
  session found rows pushing a page to 464px at a 390 viewport only because it
  added the third width.
- **Read the frames as a contact sheet, side by side.** Pale-on-pale is
  invisible frame-by-frame and unmissable beside three siblings.
- **A passing assertion tells you what you asked about; a frame tells you what
  is there.** One session had 56 hashed, distinct, fully-passing frames while
  the orb — the entire argument of that screen — was absent.

If a build fails, read the deployment log before changing code. Two of this
project's longest debugging sessions were a dead server and a stale `.next`, not
a defect.

---

## Launching your own work

You have three mechanisms and they are not interchangeable.

**1 · The `Agent` tool — a subagent inside your session.** Bounded work that
returns a report: review this diff, sweep for this pattern, verify this claim.
No new server, no port, no 3 GB. Reach for this first.

**2 · The `Workflow` tool — fan-out across many agents.** Deterministic control
flow, runs in the background. For migrations, audits and broad sweeps. It can
spawn dozens of agents, so it is opt-in per invocation.

**3 · `claude --bg` — a real background session.**

```bash
claude --bg --dangerously-skip-permissions "<the brief>"
```

Returns immediately; manage with `claude agents`; it appears in `ListAgents` and
you can reach it with `SendMessage`.

**It inherits the current working directory.** So it must be launched from
inside a prepared checkout — one that already has its `.env` and its git author
set — or you get the two failures this project has already paid for: Playwright
cannot run at all for want of `apps/web/.env.local`, and Vercel **blocks** a
commit not authored `SAHODALABS <development@sahodalabs.com>`.

---

## Before you hand your branch over

**You own your lane and may merge it into `wt-core` yourself.** What you owe is
a branch that is honest about its own state, and a handoff that says what you
could not verify.

The one thing you may not do is write to `wt-web`. Verify what you can, then:

- `pnpm turbo run typecheck lint test --filter=...[origin/wt-web] && pnpm format:check`
- **Never pipe the gate.** `pnpm gate | tail -60` returns *tail's* exit code.
- **A leg finishing in under a second is a cache replay** and verified nothing.
- **Group failures by error message; never count them.** A session reported 32
  failures: 61 lines were `ERR_CONNECTION_REFUSED` from a server it had killed
  itself and exactly 2 were real. **Six unrelated tests failing at once is an
  environment. One test failing is a diff.**
- Run the `reviewer` agent on `git diff origin/wt-web`.
- Then `/handoff`, which writes your session record to
  `docs/workflow/handoffs/<role>-<date>.md` and commits it. **That file is how
  the advisor and the other lead learn what you did**, and it is what your own
  next session reads to restore context. If it is not in git, it did not
  happen.
- Push your branch, then merge it into `wt-core` when it is ready. Run the full
  gate after that merge, not before it — a merge is exactly when things go red.
  **`wt-core` → `wt-web` is the one gated step** and is not yours to take.

**Say plainly in the handoff what you could NOT verify.** A lead who writes
"the smoke suite is UNRUN here, it needs Clerk keys this sandbox does not
have" is giving the advisor something usable. A lead who omits it is handing
over a branch that looks more finished than it is.

---

## The rule this whole folder exists for

**A guard never shown to fail is not a guard.** Break the thing it tests. Watch
it go red. If it does not go red, you have a comfort blanket.

Six guards in this repository were found passing by not looking, including a
public payment webhook that no check covered for months, and twenty-six billing
tests that had never once executed because `describe.skipIf` reports a suite
that ran nothing as *passing*.
