# 08 · Roles

**Three people work on this repository. This file says who owns what, who may
merge, and which branch each one cuts from.** Read your own card before your
first task. Read the other two before you touch anything shared.

Written 24 August 2026. Every number in the Facts section was measured, not
assumed; the command that produced it is given so you can re-measure when this
file goes stale.

---

## The facts these roles are built on

Re-measure with `git fetch --all` first. All counts are `page.tsx` files under
`apps/web/src/app/`.

| Ref | Date | Routes | Behind `wt-web` |
|---|---|---|---|
| **`origin/wt-web`** | 2026-08-24 | **58** | **0 — this is the product** |
| `origin/main` | 2026-08-07 | 20 | 692 |
| `idivasm/main` | 2026-08-23 | 11 | 693 |
| `idivasm/wt-web` | 2026-08-05 | 20 | 693 |

**Two conclusions, and everything below depends on them.**

**1 · `main` is not the trunk. It is the root commit the trunk was rebuilt on.**
It was never advanced after 7 August. A branch cut from any `main` is a
20-route skeleton of a 58-route product. `.claude/commands/fix.md` still says
*"Create a branch from `origin/main`"* — that instruction is now wrong and is
corrected in `09_CLOUD_SESSIONS.md`.

**2 · The two GitHub remotes are not mirrors of each other.**

| | `development156/sahodalabs` (`origin`) | `IDIVASM/sahodalabs` (`idivasm`) |
|---|---|---|
| Carries the current product | **yes** | no — 693 commits stale |
| Vercel project attached | **yes** — `prj_L4IDks4bMlBwObyKcHzej6lVqm9D` | **none** |
| Preview URL per branch | **yes, every branch** | **no** |

Measured from the Vercel API: the one project's only git link is
`{type: github, org: development156, repo: sahodalabs}`, and its last twenty
deployments cover `wt-web`, `wt-sec`, `wt-handoff`, `wt-loop` and
`squashed-root` — every pushed branch gets a `branchAlias` preview at
`sahodalabs-git-<branch>-development-4417s-projects.vercel.app`.

**So all work happens on `development156/sahodalabs`, cut from `wt-web`.**
A branch pushed anywhere else has no preview, and a branch cut from `main` is
not this product.

---

## A1 — Advisor (the founder) — the single executor

**Rules on work, and is the only session that executes it.** Founder's ruling,
24 August 2026.

This amends `02_ADVISOR.md`, which says the advisor "does not write code" and
sits "never in a worktree." Under this model the advisor still does not *author*
changes — the two leads do — but it is the only session that pulls their
branches, runs the gate, merges, and touches production. It therefore needs a
worktree, and the property that survives is the one that mattered: **the advisor
has no stake in any change's design, because it wrote none of them.**

| | |
|---|---|
| Sees | both lead branches, and everything else |
| Pulls | `wt-design` and `wt-research` |
| **Runs the gate** | **yes — only A1** |
| **Merges to `wt-web`** | **yes — only A1** |
| **Applies a migration** | **yes — only A1** |
| **Touches production** | **yes — only A1** |
| Launches parallel sessions | yes — new branch, new worktree, new session |
| Port block | 3240–3249 (Lightpanda +100) |

**Launching a parallel session.** The advisor makes the lane — worktree, branch
off `origin/wt-web`, `git config --worktree` author, all three `.env` copies,
a free port — then writes a complete paste-ready brief using
`03_SESSION_PROTOCOL.md`. The founder runs it and pastes the output back. Or,
when told to, the advisor launches it itself with
`claude --bg --dangerously-skip-permissions "<brief>"` from inside the prepared
worktree, since that command **inherits the cwd**.

**Merging is the most dangerous operation here** and `04_PARALLEL_SESSIONS.md`
carries its rules. The three that get skipped: cut `wt-release` off `wt-web`
rather than merging into trunk; run the full gate after **every single** merge,
not at the end; and check `git rev-list --count HEAD..<branch>` first, because a
lane can hold its whole output uncommitted and `git merge` will succeed having
merged nothing.

---

## A2 — Design lead · `/lead-design`

**Builds UI and UX against the current design system.** Own worktree, own
branch. Writes code; does not integrate it.

| | |
|---|---|
| Branch | `wt-design`, cut from `origin/wt-web` — **never `main`** |
| Access | **everything.** No path is withheld |
| Focus | `apps/web/src/components/**` · `apps/web/src/app/**/*.tsx` · `packages/shared/tokens.css` · `docs/37_Design_System_v5.md` |
| Declares | anything outside that focus, in `apps/web/REQUESTS.md`, before the first edit |
| Merges | no — pushes `wt-design`, A1 pulls and merges |
| Applies a migration | no — writes it, A1 applies it |
| Port block | 3250–3259 (Lightpanda +100) |

**The canon is `docs/37_Design_System_v5.md` and nothing else.** Four documents
here claim authority over design; three are superseded and one of those still
says in its own header that it *"wins for any token or component value."* It
does not. From each file's own header:

```
docs/37_Design_System_v5.md    CANON — build from this
  supersedes docs/26_Design_System_v4.md      ("Do not build from this file.")
    supersedes docs/08_Design_System_SAHODA_LABS.md   (still claims to win)
    supersedes docs/ui-package/sahoda-labs/
docs/design2.0/UI_RULES_v3.md  superseded — points back at 08 "for governance"
```

**Read `docs/45_Product_Structure.md` before designing any screen.** 60,507
words read out of the running product's code and its production database. Its
most important section is **what this product may not show.**

The three product facts that otherwise produce unshippable screens — no figure
without a query behind it, seven distinct kinds of nothing, state carried by
fill weight and glyph rather than hue — and the mechanics that bite, are in
`.claude/commands/lead-design.md`. Read it; it is the working card.

---

## A3 — Research lead · `/lead-research`

**Researches and builds anything.** Own worktree, own branch. Writes code; does
not integrate it.

| | |
|---|---|
| Branch | `wt-research`, cut from `origin/wt-web` — **never `main`** |
| Access | **everything.** No path is withheld |
| Declares | intended scope in `apps/web/REQUESTS.md` before the first edit |
| Merges | no — pushes `wt-research`, A1 pulls and merges |
| Applies a migration | no — writes it, A1 applies it |
| Port block | 3260–3269 (Lightpanda +100) |

**Both leads have access to everything, so the boundary is declaration.** Two
lanes editing the same *file* is a conflict git will show you. Two lanes editing
the same *concept* is two designs of the same thing where only one survives, and
git shows you nothing. The worst instance here: one lane fixed a double-charge
in `onboarding-flow.tsx` while another replaced that whole stage with
`OnboardingStage`, making the file unreachable. **Merging would have silently
killed a money guard and nothing would have failed.**

**Every shared surface touched goes in the handoff.** Lanes broke each other
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
- **Nobody merges their own branch to `wt-web`.** A1 merges, into a
  `wt-release` cut off `wt-web`, running the full gate after **every single
  merge** — not at the end, or you cannot tell which merge went red.
- **Nobody but A1 runs the gate, applies a migration, or touches production.**
  The leads verify their own work in their own sandbox; the **authoritative**
  gate is A1's, and it is the one that decides whether something merges.

---

## One executor

**Execution is single-threaded, by ruling.** The advisor is the only session
that runs the gate, merges, or touches production. The leads write code in
their own worktrees and push; they do not integrate.

This is what makes the whole arrangement fit. Three people writing in parallel
costs nothing extra; three people *executing* in parallel costs ports, memory
and a merge order nobody is holding. Measured on the founder's machine,
24 August 2026: 15 GB total, 7 GB available, and each running lane is a Next
server plus a browser at 3–4 GB. `journalctl -k` shows `next-server` OOM-killed
at 2.3 GB anon-rss on 22 August, and a prior session recorded 22 kernel OOM
kills in three hours with four sessions running.

**The advisor may still run several lanes at once** — it launches them, and
before starting another it checks:

```bash
free -g
journalctl -k | grep -i "killed process" | tail -5
ss -ltnp | grep -E ":(32[4-9][0-9])"
```

Under 6 GB available, do not start another. **Four concurrent lanes is the
practical ceiling** and it is set by review bandwidth long before memory:
sessions run in parallel, ruling on their reports is serial, and an unread
report is worse than no report because it looks like coverage.

**Leads working in cloud sandboxes do not consume this at all** — their compute
is their own. See `09_CLOUD_SESSIONS.md`.

---

## Learning what the others did

Do not build a new mechanism. Three exist and are in use:

| Channel | What it is |
|---|---|
| `apps/web/REQUESTS.md` | the cross-lane request log — 987 lines, tracked, un-ignored by name at `.gitignore:114` |
| `LEARNINGS.md` | the running record, one line per PR — 216 lines, tracked |
| `docs/workflow/handoffs/` | one dated file per role per session, written by `/handoff` |

**`/handoff` persists; `/kickoff` reads.** At the end of a session `/handoff`
writes `docs/workflow/handoffs/<role>-<date>.md` and commits it on that role's own
branch. At the start of the next one, `/kickoff` fetches and reads the newest
handoff from each *other* role's branch before planning anything.

That loop is git-backed, so it needs no live coordination and survives everyone
being asleep. Live messaging between sessions exists — `ListAgents` and
`SendMessage` reach peer sessions on this account — but it is a convenience, not
the record. **If it is not in git, it did not happen.**
