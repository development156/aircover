# 07 · Running the workflow

The practical version. What a day looks like, what to set up once, and what to do when something goes wrong.

> **AMENDED 24 August 2026.** This file describes the single-operator day. The
> project now runs three roles — `/advisor`, `/lead-design`, `/lead-research` —
> and **only the advisor executes**: it alone runs the gate, merges, applies
> migrations, touches production and launches parallel sessions. The leads write
> code in their own worktrees and push. **Read `08_ROLES.md` for who owns what**;
> where it disagrees with this file, it wins.

---

## Set up once

**1 · Put this folder in the repo** at `docs/workflow/`, and point `CLAUDE.md` at it:

```markdown
## Workflow

Before doing anything substantial, read `docs/workflow/00_START_HERE.md`.
```

**2 · Make the advisor a command.** `.claude/commands/advisor.md` — the content is in `02_ADVISOR.md`. Then `/advisor` in any session.

**3 · Make the preamble a command too.** `.claude/commands/brief.md`:

```markdown
---
description: Draft a session brief using the project preamble
---

Read docs/workflow/03_SESSION_PROTOCOL.md and docs/workflow/05_TRAPS.md.

Write a complete, paste-ready session brief for the task I describe.
Use the standard preamble. Include only the traps this task will
actually meet, with their measured evidence rather than the rule.
Specify the mutation that would prove each fix. End with the report
format.
```

**4 · Check what points at the design canon.** Corrected 24 August 2026:
`git grep -l "08_Design_System" wt-web -- .claude/` returns **nothing**, so the
skills and subagents are clean. The offender was `CLAUDE.md` itself, whose
line 3 read *"Tokens/components = 08_Design_System"* — the bottom of a
`08 → 26 → 37` supersession chain, loaded into every session. Fixed to name
`docs/37_Design_System_v5.md`. Re-check with
`grep -rn "08_Design_System\|26_Design_System" CLAUDE.md .claude/`; a session
told to read the wrong canon builds confidently wrong.

**5 · Allocate ports.** Write your block down somewhere: 3241–3249 for build lanes, +100 for Lightpanda. Reusing a live port is how a lane tests another lane's build.

---

## A day

**Morning — read the reports.**

Overnight lanes wrote to `REPORT-<lane>.md` in their worktrees. Note that `.gitignore` has a `*.md` rule, so those reports exist **only in the worktree** — `git worktree remove` takes them with it. Read before you clean up.

Open the advisor terminal, `/advisor`, and paste or point it at the reports. Ask for a ruling: what was earned, what was not, what changes.

**Read the failures section first.** And the sentence that says what was *not* done — the good sessions state their own boundaries.

**Midday — decide, then brief.**

Three or four lanes maximum. Scope them so no two touch the same files, and say so explicitly in each brief. Fire them in separate terminals, in separate worktrees, on separate ports. Then leave them alone.

**Afternoon — look at the product.**

Not the reports. The product. Run a branch, open it on your phone, try to do something.

```
cd .claude/worktrees/<lane>
pkill -f "next dev"
rm -rf apps/web/.next
pnpm dev -- -p 3300
```

Kill first, then delete. Deleting under a live server leaves the process holding the inodes and one route answers 200 while everything else dies.

**This hour is the highest-value hour available.** Every defect that mattered in the last twenty sessions came from a human opening a browser — a nav bar reading "S Sah", a chart that looked broken, four orange buttons shouting at each other, a month calendar that was not a calendar on a phone. None came from tests.

**Evening — merge, or don't.**

Merging is its own session with its own rules, and it runs alone. See `04_PARALLEL_SESSIONS.md`. Do not merge lanes that are still running; a session cannot tell "finished" from "still thinking" except by checking whether it reported.

---

## Before you start anything

```
free -g
journalctl -k | grep -i "killed process" | tail -5
ss -ltnp | grep -E ":(324[0-9]|33[0-9][0-9])"
```

Under 6 GB available: do not start a fourth lane. Recent kills: something already died and may be sitting idle. Ports held: find out by whom before allocating.

---

## When a report looks bad

**Before believing it, check the environment.**

Group the failures by error message. Six unrelated tests failing at once is an environment; one test failing is a diff. `ERR_CONNECTION_REFUSED` in bulk means a dead server, not a hundred defects.

Check whether the lane used `next start` or `pnpm dev`. Check whether `.next` was deleted under a live server. Check `journalctl -k` for an OOM kill. Check `readlink /proc/<pid>/cwd` on whatever holds the port.

Four sessions lost real hours to failures that were entirely environmental and looked exactly like code regressions.

---

## When a lane goes wrong

**It committed to the wrong branch.** `git reflog` — it is recoverable, and this has happened. Verify `git branch --show-current` after every checkout in future briefs.

**It wrote to production.** `SAHODA_E2E_ACK_TARGET` now blocks unacknowledged Playwright runs at module scope. If a lane predates that guard, count the rows it left and clean them up deliberately.

**It reported an unrun suite as passed.** Re-run that leg alone, on a quiet box, and re-rule. This is the one failure that must never be waved through.

**It half-finished a screen.** Better to let it finish the current one and stop than to interrupt. A half-rebuilt screen is worse than an untouched one, and the briefs say so.

---

## The order of things, from here

**1 · Merge.** Everything green is on branches. Production may be well behind — check `git log wt-web..wt-integrate3 --oneline | wc -l`.

**2 · Use it for an hour.** On a phone, as a stranger, trying to schedule one post. Write down every moment of hesitation — not bugs, *friction*.

**3 · Clerk production keys.** One-way door, thirty minutes, and it gets more expensive with every signup.

**4 · Supabase Pro.** $25/month, and it is the difference between having backups and believing in them.

**5 · Five real businesses, not fifty.** They will tell you what fifty sessions could not.

---

## The two sentences worth keeping

**A guard never shown to fail is not a guard.**

**And: the engineering is ahead of the finish.** That was a session's own verdict and it is still true. This codebase refuses to lie — it distinguishes seven kinds of nothing, it will not render a number it cannot prove, and its guards have been audited by other guards. What it has not had is a person using it.

Everything in this folder exists to protect the first quality. Only you can supply the second.
