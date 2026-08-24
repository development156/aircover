# 08 · Roles and branches

**Three people work on this repository, each in a Claude Code cloud session, each
on their own branch.** This file says which branch is yours, where your work
goes, and who is allowed to merge it.

Written 24 August 2026. Every number below was measured, and the command that
produced it is given so you can re-measure when this file goes stale.

---

## The flow

```
                    origin/wt-web          ← production. Vercel deploys this.
                         │
        ┌────────────────┼────────────────┐
        │                │                │      each lane is cut from wt-web
   wt-girija         wt-jiban         wt-divas   and NEVER from main
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                     wt-core               ← everything lands here first
                         │
                    (review)               ← the advisor, and only the advisor
                         ▼
                    origin/wt-web
```

**You push to your own lane. Your lane merges into `wt-core`. `wt-core` is
reviewed, and only then does it reach `wt-web`.** Nobody merges their own work
into `wt-core`, and nobody but the advisor touches `wt-web`.

| Branch | Who | What it is |
|---|---|---|
| `wt-girija` | Girija | a working lane, cut from `wt-web` |
| `wt-jiban` | Jiban | a working lane, cut from `wt-web` |
| `wt-divas` | Divas | a working lane, cut from `wt-web` |
| `wt-core` | the advisor | the integration branch. Reviewed before it moves. |
| `wt-web` | the advisor | **production.** Only the advisor pushes here. |

All five were created at `70ce7b26` on 24 August 2026 and all five carry 58
routes. Re-check with:

```bash
git fetch --all --prune
for b in wt-web wt-core wt-girija wt-jiban wt-divas; do
  printf "%-12s %s routes=%s\n" "$b" "$(git rev-parse --short origin/$b)" \
    "$(git ls-tree -r --name-only origin/$b apps/web/src/app | grep -c page.tsx)"
done
```

---

## The rule that comes before everything

**Pull at the start of every session. Every time. No exceptions.**

```bash
git fetch --all --prune
git pull --ff-only origin <your-branch>
```

This is not hygiene, it is the difference between building on the product and
building on a memory of it. Three lanes and an integration branch move
independently, and a session that starts from a stale checkout writes changes
against code that no longer exists. `/kickoff` does this for you as its first
action; run it before you plan anything.

**`--ff-only` on purpose.** If it refuses, your lane and the remote have
diverged and you need to look at why rather than let a merge happen by accident.

---

## The one thing that will silently ruin a week

**Never cut a branch from `main`. Any `main`.**

| Ref | Date | Routes | Behind `wt-web` |
|---|---|---|---|
| **`origin/wt-web`** | 2026-08-24 | **58** | **0 — this is the product** |
| `origin/main` | 2026-08-07 | 20 | 692 |
| `idivasm/main` | 2026-08-23 | 11 | 693 |
| `idivasm/wt-web` | 2026-08-05 | 20 | 693 |

`main` is the root commit the trunk was rebuilt on after the August history
reset. It was never advanced. **A branch cut from it is a 20-route skeleton of a
58-route product**, with no current design system in `docs/`.

`.claude/commands/fix.md` still says *"Create a branch from `origin/main`"*.
That instruction predates the reset and is wrong.

**And the repository is `development156/sahodalabs`.** There are two GitHub
remotes and they are not mirrors:

| | `development156/sahodalabs` | `IDIVASM/sahodalabs` |
|---|---|---|
| Carries the current product | **yes** | no, 693 commits behind |
| Vercel project attached | **yes** — `prj_L4IDks4bMlBwObyKcHzej6lVqm9D` | **none** |
| Preview URL per branch | **yes, every branch** | **no** |

Measured from the Vercel API: the one project's only git link is
`{org: development156, repo: sahodalabs}`. Every branch pushed there gets a
preview at `sahodalabs-git-<branch>-development-4417s-projects.vercel.app`.
A branch pushed anywhere else has no preview at all.

---

## What each person does

**Everyone has access to everything.** No path is withheld from anyone. The
roles below describe focus, not permission.

### Girija — design · `/lead-design`

Builds UI and UX against **`docs/37_Design_System_v5.md`**, which is canon.
Three other documents in this repository claim authority over design and one of
them still says in its own header that it *"wins for any token or component
value."* It does not. From each file's own header:

```
docs/37_Design_System_v5.md    CANON — build from this
  supersedes docs/26_Design_System_v4.md      ("Do not build from this file.")
    supersedes docs/08_Design_System_SAHODA_LABS.md   (still claims to win)
    supersedes docs/ui-package/sahoda-labs/
docs/design2.0/UI_RULES_v3.md  superseded — points back at 08 "for governance"
```

Read `docs/45_Product_Structure.md` before designing any screen. 60,507 words
read out of the running product's code and its production database; its most
important section is **what this product may not show.**

### Jiban — research · `/lead-research`

Researches and builds anything. The standing non-negotiables are in
`.claude/commands/lead-research.md` and they are not negotiable: RLS on every
table, the ledger never lies, no invented numbers, one body **and one format**
per channel.

### Divas — advisor · `/advisor`

Rules on the work and is **the only session that executes it**: pulls the lanes,
runs the gate, merges into `wt-core`, reviews, promotes to `wt-web`, applies
migrations, touches production, and launches parallel sessions.

This amends `02_ADVISOR.md`, which says the advisor "does not write code" and
sits "never in a worktree". The advisor still authors nothing — the lanes do —
but it needs a worktree to integrate. **What survives is the property that
mattered: the advisor has no stake in any change's design, because it wrote none
of them.** What it loses is independence from the integration, so when a merge
goes wrong it is ruling on its own work and must say so out loud.

---

## Staying out of each other's way

Everyone has full access, so the boundary is **declaration**.

Before starting a task that reaches outside your usual ground, write what you
are about to touch into `apps/web/REQUESTS.md`, and read the tail of that file
for what the others have declared.

**Two lanes editing the same *file* is a conflict git will show you. Two lanes
editing the same *concept* is two designs of the same thing where only one
survives, and git shows you nothing.** The worst instance here: one lane fixed a
double-charge in `onboarding-flow.tsx` while another replaced that whole stage
with `OnboardingStage`, making the file unreachable. **Merging would have
silently killed a money guard and nothing would have failed.**

**Every shared surface you touch goes in your handoff.** Lanes broke each other
four times exactly this way: `adapterFor` gained a required third parameter,
`decideAttach` a fourth, `violation-copy` changed app-wide, `BrainRead` gained a
required field. A required field breaks constructors, not readers — say which.

---

## What nobody does

These are engineering facts, not permissions.

- **Nobody executes a publish.** This product posts to real customers' feeds and
  the blast radius of a cross-tenant mistake is another business's account.
- **Nobody runs `supabase db push`.** Production's recorded migration count
  drifts behind its file count and a push re-runs applied migrations. Production
  ref is `rloztdhzfliyvpvxsgjl` and **there is no staging.**
- **Nobody runs irrecoverable SQL** — no `DROP`, no `TRUNCATE`, no `DELETE` or
  `UPDATE` without a `WHERE`, against any table holding real data.
- **Nobody force-pushes a shared branch.** A rebase over someone else's work
  loses it silently.
- **Nobody merges their own lane into `wt-core`,** and nobody but the advisor
  pushes `wt-web`.
- **Nobody but the advisor applies a migration.** Write it; the advisor applies it.

---

## Handoffs — how each lane learns what the others did

`/handoff` writes `docs/workflow/handoffs/<name>-<date>.md` and commits it.
`/kickoff` pulls, reads **your own** newest handoff to resume, then each other
lane's to learn what moved under you.

That loop is git-backed, so it needs no live coordination and survives everyone
being asleep. **If it is not in git, it did not happen.**

Two sections are where the value hides and both are easy to skip: **every shared
surface touched**, and **every guard written with the mutation that proved it.**

Also in use, and older than this file: `apps/web/REQUESTS.md` (987 lines, the
cross-lane request log) and `LEARNINGS.md` (one line per PR).
